import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ResolveMemberContextService } from './ResolveMemberContextService';
import { TokenBlacklistPort } from '@app/application/port/out/auth/TokenBlacklistPort';
import { MemberContextCachePort } from '@app/application/port/out/member/MemberContextCachePort';
import { LoadMemberContextPort } from '@app/application/port/out/member/LoadMemberContextPort';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    ACCESS_TOKEN_EXPIRES_IN: 28800,
    PERMISSION_CACHE_TTL: 300,
  }),
}));

const TEST_UUID = '00000000-0000-0000-0000-000000000001';

const mockJwt = {
  verify: jest.fn(),
} as unknown as JwtService;

const mockTokenBlacklist: jest.Mocked<TokenBlacklistPort> = {
  addToBlacklist: jest.fn(),
  isBlacklisted: jest.fn(),
  getBlacklistReason: jest.fn(),
};

const mockMemberContextCache: jest.Mocked<MemberContextCachePort> = {
  getByMemberId: jest.fn(),
  setByMemberId: jest.fn(),
  isAvailable: true,
};

const mockLoadMemberContext: jest.Mocked<LoadMemberContextPort> = {
  loadMemberContext: jest.fn(),
};

const memberData = {
  id: TEST_UUID,
  email: 'u@e.com',
  roleName: 'admin',
  roleCode: 'SUPERADMIN',
  permissions: ['member.view'],
  status: true,
};

describe('ResolveMemberContextService', () => {
  let service: ResolveMemberContextService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ResolveMemberContextService(
      mockJwt,
      mockTokenBlacklist,
      mockMemberContextCache,
      mockLoadMemberContext,
    );
  });

  describe('黑名單', () => {
    it('Token 在黑名單 → UnauthorizedException', async () => {
      mockTokenBlacklist.isBlacklisted.mockResolvedValue(true);

      await expect(service.resolve('blacklisted-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('Redis 不可用 → ServiceUnavailableException（fail-closed）', async () => {
      mockTokenBlacklist.isBlacklisted.mockRejectedValue(
        new ServiceUnavailableException('認證服務暫時不可用，請稍後再試'),
      );

      await expect(service.resolve('some-token')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('黑名單檢查在 JWT 驗證之前 → 已登出的 token 即使簽章有效也擋下', async () => {
      mockTokenBlacklist.isBlacklisted.mockResolvedValue(true);

      await expect(service.resolve('blacklisted-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockJwt.verify).not.toHaveBeenCalled();
    });
  });

  describe('JWT 驗證', () => {
    beforeEach(() => {
      mockTokenBlacklist.isBlacklisted.mockResolvedValue(false);
    });

    it('verify 失敗 → UnauthorizedException', async () => {
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(service.resolve('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refresh token 被當 access token 使用 → UnauthorizedException', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: TEST_UUID,
        type: 'refresh',
      });

      await expect(service.resolve('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockMemberContextCache.getByMemberId).not.toHaveBeenCalled();
    });
  });

  describe('MemberContext 取得', () => {
    beforeEach(() => {
      mockTokenBlacklist.isBlacklisted.mockResolvedValue(false);
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: TEST_UUID,
        type: 'access',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
    });

    it('快取命中 → 不查 DB', async () => {
      mockMemberContextCache.getByMemberId.mockResolvedValue(
        JSON.stringify({ ...memberData, sub: TEST_UUID }),
      );

      const result = await service.resolve('valid-token');

      expect(result.sub).toBe(TEST_UUID);
      expect(mockLoadMemberContext.loadMemberContext).not.toHaveBeenCalled();
    });

    it('快取內容不是合法 JSON → fallback 到 DB 而非拋出', async () => {
      // JSON.parse 拋出若未被接住會逃出呼叫鏈兜成 500，而這條路徑服務所有已認證請求
      mockMemberContextCache.getByMemberId.mockResolvedValue('{截斷的內容');
      mockLoadMemberContext.loadMemberContext.mockResolvedValue(memberData);

      const result = await service.resolve('valid-token');

      expect(result.sub).toBe(TEST_UUID);
      expect(mockLoadMemberContext.loadMemberContext).toHaveBeenCalled();
    });

    it('快取 schema 不符 → fallback 到 DB', async () => {
      mockMemberContextCache.getByMemberId.mockResolvedValue(
        JSON.stringify({ sub: TEST_UUID }),
      );
      mockLoadMemberContext.loadMemberContext.mockResolvedValue(memberData);

      const result = await service.resolve('valid-token');

      expect(result.email).toBe('u@e.com');
    });

    it('快取未命中且 DB 查得到 → 回傳並寫入快取', async () => {
      mockMemberContextCache.getByMemberId.mockResolvedValue(null);
      mockLoadMemberContext.loadMemberContext.mockResolvedValue(memberData);

      const result = await service.resolve('valid-token');

      expect(result.roleCode).toBe('SUPERADMIN');
      expect(mockMemberContextCache.setByMemberId).toHaveBeenCalled();
    });

    it('DB 找不到使用者 → UnauthorizedException', async () => {
      mockMemberContextCache.getByMemberId.mockResolvedValue(null);
      mockLoadMemberContext.loadMemberContext.mockResolvedValue(null);

      await expect(service.resolve('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('帳號狀態', () => {
    beforeEach(() => {
      mockTokenBlacklist.isBlacklisted.mockResolvedValue(false);
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: TEST_UUID,
        type: 'access',
      });
    });

    it('DB 顯示帳號已停用 → AccountDisabledException', async () => {
      mockMemberContextCache.getByMemberId.mockResolvedValue(null);
      mockLoadMemberContext.loadMemberContext.mockResolvedValue({
        ...memberData,
        status: false,
      });

      await expect(service.resolve('valid-token')).rejects.toThrow(
        AccountDisabledException,
      );
    });

    it('快取顯示帳號已停用 → AccountDisabledException', async () => {
      mockMemberContextCache.getByMemberId.mockResolvedValue(
        JSON.stringify({ ...memberData, sub: TEST_UUID, status: false }),
      );

      await expect(service.resolve('valid-token')).rejects.toThrow(
        AccountDisabledException,
      );
    });
  });

  // 前一版專案的 WS 認證重寫了一份判定邏輯並漏掉這段，導致帳號被強制登出後
  // 既有的 WS 連線仍然有效。這組測試是那個缺陷的迴歸防線。
  describe('tokenVersion 連坐撤銷', () => {
    beforeEach(() => {
      mockTokenBlacklist.isBlacklisted.mockResolvedValue(false);
    });

    it('token 版本落後於 DB 現值 → UnauthorizedException', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: TEST_UUID,
        type: 'access',
        tokenVersion: 1,
      });
      mockMemberContextCache.getByMemberId.mockResolvedValue(null);
      mockLoadMemberContext.loadMemberContext.mockResolvedValue({
        ...memberData,
        tokenVersion: 2,
      });

      await expect(service.resolve('stale-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('走快取路徑時同樣比對 tokenVersion', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: TEST_UUID,
        type: 'access',
        tokenVersion: 1,
      });
      mockMemberContextCache.getByMemberId.mockResolvedValue(
        JSON.stringify({ ...memberData, sub: TEST_UUID, tokenVersion: 2 }),
      );

      await expect(service.resolve('stale-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('版本相符 → 通過', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: TEST_UUID,
        type: 'access',
        tokenVersion: 2,
      });
      mockMemberContextCache.getByMemberId.mockResolvedValue(null);
      mockLoadMemberContext.loadMemberContext.mockResolvedValue({
        ...memberData,
        tokenVersion: 2,
      });

      await expect(service.resolve('valid-token')).resolves.toMatchObject({
        sub: TEST_UUID,
      });
    });

    it('兩邊都未帶版本（舊 token / 舊資料）→ 視為相符', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: TEST_UUID,
        type: 'access',
      });
      mockMemberContextCache.getByMemberId.mockResolvedValue(null);
      mockLoadMemberContext.loadMemberContext.mockResolvedValue(memberData);

      await expect(service.resolve('valid-token')).resolves.toMatchObject({
        sub: TEST_UUID,
      });
    });
  });

  /**
   * 側別檢查。
   *
   * **這裡是唯一驗得到「這道檢查存在」的地方。** e2e 那支
   * 「前台 token 打後台端點 → 401」驗的是**結果**而非機制——
   * 前後台之間其實有三道獨立的防線：
   *
   *   1. 各自的簽發 secret（跨側的 token 連簽章都驗不過）
   *   2. 本段的 `side` 比對
   *   3. **兩張表的 ID 空間不相交**——前台使用者的 id 在 `members` 裡查不到
   *
   * 任何一道單獨都擋得住，所以 e2e 就算三道全拿掉也仍然是 401。
   * 那支測試仍然有價值（它釘住「結果必須是拒絕」），但它分辨不出機制。
   */
  describe('側別', () => {
    beforeEach(() => {
      mockTokenBlacklist.isBlacklisted.mockResolvedValue(false);
      mockMemberContextCache.getByMemberId.mockResolvedValue(null);
      mockLoadMemberContext.loadMemberContext.mockResolvedValue(memberData);
    });

    it('side 為 admin → 通過', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: TEST_UUID,
        type: 'access',
        side: 'admin',
      });

      await expect(service.resolve('token')).resolves.toMatchObject({
        sub: TEST_UUID,
      });
    });

    it('⭐ side 為 front → 拒絕', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: TEST_UUID,
        type: 'access',
        side: 'front',
      });

      await expect(service.resolve('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    /**
     * **有時效的相容措施**：本欄位上線前簽出的 token 沒有 `side`，
     * 一律拒絕會讓部署當下所有人被登出。
     *
     * 部署時間超過 refresh token 效期（預設 7 天）之後，所有流通中的 token
     * 都會帶 side，屆時這支測試要改成「拒絕」。
     */
    it('⭐ 缺少 side → 視為 admin 並通過（暫時的相容）', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: TEST_UUID,
        type: 'access',
      });

      await expect(service.resolve('token')).resolves.toMatchObject({
        sub: TEST_UUID,
      });
    });
  });
});
