import { JwtService } from '@nestjs/jwt';
import { RefreshTokenService } from './RefreshTokenService';
import { TokenBlacklistPort } from '../../../port/out/auth/TokenBlacklistPort';
import { LoadMemberContextPort } from '../../../port/out/member/LoadMemberContextPort';
import { SaveAuthLogPort } from '../../../port/out/auth/SaveAuthLogPort';
import { SaveMemberPort } from '../../../port/out/member/SaveMemberPort';
import { FeatureFlagService } from '../../shared/FeatureFlagService';
import { InvalidRefreshTokenException } from '@app/domain/exception/InvalidRefreshTokenException';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';

jest.mock('../../../../infrastructure/validate-env', () => ({
  getEnv: () => ({
    ACCESS_SECRET: 'a'.repeat(32),
    REFRESH_SECRET: 'b'.repeat(32),
    ACCESS_TOKEN_EXPIRES_IN: 7200,
    REFRESH_TOKEN_EXPIRES_IN: 604800,
  }),
}));

const MEMBER_UUID = '00000000-0000-4000-8000-000000000001';

const makeContext = () => ({
  id: MEMBER_UUID,
  email: 'u@e.com',
  roleName: '管理者',
  roleCode: 'SUPERADMIN',
  permissions: ['BACKEND:ACCOUNT:VIEW'],
  status: true,
});

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let jwt: { sign: jest.Mock; verify: jest.Mock };
  let blacklist: jest.Mocked<TokenBlacklistPort>;
  let loadMemberContext: jest.Mocked<LoadMemberContextPort>;
  let saveAuthLog: jest.Mocked<SaveAuthLogPort>;
  let featureFlags: { isEnabled: jest.Mock };
  let saveMember: { incrementTokenVersion: jest.Mock };
  let clearMemberContext: { clearMemberContext: jest.Mock };

  beforeEach(() => {
    jwt = {
      sign: jest.fn((payload: { type: string }) => `signed:${payload.type}`),
      verify: jest.fn(),
    };
    blacklist = {
      isBlacklisted: jest.fn().mockResolvedValue(false),
      addToBlacklist: jest.fn().mockResolvedValue(undefined),
      getBlacklistReason: jest.fn().mockResolvedValue(null),
    };
    loadMemberContext = {
      loadMemberContext: jest.fn().mockResolvedValue(makeContext()),
    };
    saveAuthLog = { saveAuthLog: jest.fn() };
    featureFlags = { isEnabled: jest.fn().mockReturnValue(false) };
    saveMember = { incrementTokenVersion: jest.fn() };
    clearMemberContext = { clearMemberContext: jest.fn() };

    service = new RefreshTokenService(
      jwt as unknown as JwtService,
      blacklist,
      loadMemberContext,
      saveAuthLog,
      featureFlags as unknown as FeatureFlagService,
      saveMember as unknown as SaveMemberPort,
      clearMemberContext,
    );
  });

  it('合法 refresh token → 回傳新 access + 新 refresh，舊 refresh 進黑名單', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    jwt.verify.mockReturnValue({
      sub: MEMBER_UUID,
      type: 'refresh',
      exp: futureExp,
    });

    const result = await service.execute({ refreshToken: 'old-refresh' });

    expect(result.accessToken).toBe('signed:access');
    expect(result.refreshToken).toBe('signed:refresh');
    expect(result.accessTokenExpiresIn).toBe(7200);
    expect(result.refreshTokenExpiresIn).toBe(604800);
    expect(blacklist.addToBlacklist).toHaveBeenCalledWith(
      'old-refresh',
      expect.any(Number),
      'rotated',
    );
    const [, ttl] = blacklist.addToBlacklist.mock.calls[0];
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  it('輪替後的舊 refresh 被重用 → Invalid + 連坐撤銷該使用者所有 session', async () => {
    blacklist.getBlacklistReason.mockResolvedValueOnce('rotated');
    jwt.verify.mockReturnValue({ sub: MEMBER_UUID, type: 'refresh' });

    await expect(
      service.execute({ refreshToken: 'reused' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
    expect(saveMember.incrementTokenVersion).toHaveBeenCalledWith(MEMBER_UUID);
    expect(clearMemberContext.clearMemberContext).toHaveBeenCalledWith(
      MEMBER_UUID,
    );
    expect(blacklist.addToBlacklist).not.toHaveBeenCalled();
  });

  // 前端共用 refreshPromise 時，背景請求的 401 會撞上登出流程——那是正常操作。
  // 若與「輪替後重用」一視同仁，使用者在筆電按登出會連手機一起被踢。
  it('登出的 refresh 被重用 → 只拒絕本次，不得撤銷其他 session', async () => {
    blacklist.getBlacklistReason.mockResolvedValueOnce('logout');
    jwt.verify.mockReturnValue({ sub: MEMBER_UUID, type: 'refresh' });

    await expect(
      service.execute({ refreshToken: 'logged-out' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
    expect(saveMember.incrementTokenVersion).not.toHaveBeenCalled();
    expect(clearMemberContext.clearMemberContext).not.toHaveBeenCalled();
  });

  // 舊格式紀錄（改用 reason 之前寫入的值 '1'）代表「在黑名單但原因不明」。
  // 必須拒絕本次——把它與「不在黑名單」都當成 null，會讓部署當下所有既存的
  // 已登出 / 已輪替 refresh token 在剩餘 TTL 內（預設 7 天）全部復活。
  it('黑名單中但原因不明 → 拒絕本次，但不連坐撤銷', async () => {
    blacklist.getBlacklistReason.mockResolvedValueOnce('unknown');
    jwt.verify.mockReturnValue({ sub: MEMBER_UUID, type: 'refresh' });

    await expect(
      service.execute({ refreshToken: 'legacy-format' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
    expect(saveMember.incrementTokenVersion).not.toHaveBeenCalled();
    expect(clearMemberContext.clearMemberContext).not.toHaveBeenCalled();
  });

  it('payload.tokenVersion 與現值不符 → InvalidRefreshTokenException', async () => {
    jwt.verify.mockReturnValue({
      sub: MEMBER_UUID,
      type: 'refresh',
      tokenVersion: 0,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    loadMemberContext.loadMemberContext.mockResolvedValueOnce({
      ...makeContext(),
      tokenVersion: 1,
    });

    await expect(
      service.execute({ refreshToken: 'old-version' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  it('payload.type 不是 refresh → InvalidRefreshTokenException', async () => {
    jwt.verify.mockReturnValue({ sub: MEMBER_UUID, type: 'access' });

    await expect(
      service.execute({ refreshToken: 'wrong-type' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  it('jwt verify 失敗（簽章不對 / 過期）→ InvalidRefreshTokenException', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await expect(
      service.execute({ refreshToken: 'bad-sig' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  it('member 找不到 → InvalidRefreshTokenException', async () => {
    jwt.verify.mockReturnValue({
      sub: MEMBER_UUID,
      type: 'refresh',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    loadMemberContext.loadMemberContext.mockResolvedValueOnce(null);

    await expect(
      service.execute({ refreshToken: 'orphan' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  it('帳號停用 → AccountDisabledException', async () => {
    jwt.verify.mockReturnValue({
      sub: MEMBER_UUID,
      type: 'refresh',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    loadMemberContext.loadMemberContext.mockResolvedValueOnce({
      ...makeContext(),
      status: false,
    });

    await expect(
      service.execute({ refreshToken: 'disabled' }),
    ).rejects.toBeInstanceOf(AccountDisabledException);
  });

  it('payload 沒有 exp → 不呼叫 addToBlacklist（TTL = 0 時跳過）', async () => {
    jwt.verify.mockReturnValue({ sub: MEMBER_UUID, type: 'refresh' });

    await service.execute({ refreshToken: 'no-exp' });

    expect(blacklist.addToBlacklist).not.toHaveBeenCalled();
  });
});
