import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './JwtAuthGuard';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';
import { ResolveMemberContextUseCase } from '@app/application/port/in/shared/ResolveMemberContextUseCase';
import { PasswordChangeRequiredException } from '@app/domain/exception/PasswordChangeRequiredException';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    APPLICATION_PASSWORD_CHANGE_PERIOD: 6,
  }),
}));

const TEST_UUID = '00000000-0000-0000-0000-000000000001';

const makeContext = (
  authHeader?: string,
  url = '/api/admin/members',
): ExecutionContext => {
  const request = {
    headers: { authorization: authHeader },
    originalUrl: url,
    url,
    log: { error: jest.fn() },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
};

const memberContext = {
  sub: TEST_UUID,
  email: 'u@e.com',
  roleName: 'admin',
  roleCode: 'SUPERADMIN',
  permissions: ['member.view'],
  status: true,
};

const mockResolve: jest.Mocked<ResolveMemberContextUseCase> = {
  resolve: jest.fn(),
};

const mockFeatureFlags = {
  isEnabled: jest.fn().mockReturnValue(false),
  onModuleInit: jest.fn(),
};

const mockReflector = {
  getAllAndOverride: jest.fn().mockReturnValue(undefined),
} as unknown as Reflector;

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    // clearAllMocks 只清呼叫紀錄，**不清 mockReturnValue 設定的實作**——
    // 每個回傳值都要在此明確重設，否則前一個測試的設定會滲進來
    jest.clearAllMocks();
    (mockReflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    mockFeatureFlags.isEnabled.mockReturnValue(false);
    mockResolve.resolve.mockResolvedValue(memberContext);
    guard = new JwtAuthGuard(
      mockReflector,
      mockResolve,
      mockFeatureFlags as unknown as FeatureFlagService,
    );
  });

  describe('豁免路徑', () => {
    it('@Public() 路由 → 直接放行，不解析 token', async () => {
      (mockReflector.getAllAndOverride as jest.Mock).mockReturnValue(true);

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
      expect(mockResolve.resolve).not.toHaveBeenCalled();
    });

    it('/api/metrics → 直接放行（第三方 controller 無法掛 @Public）', async () => {
      await expect(
        guard.canActivate(makeContext(undefined, '/api/metrics')),
      ).resolves.toBe(true);
      expect(mockResolve.resolve).not.toHaveBeenCalled();
    });

    // Prometheus 可能帶參數 scrape，去掉 query string 後仍須通過
    it('/api/metrics?foo=1 → 直接放行', async () => {
      await expect(
        guard.canActivate(makeContext(undefined, '/api/metrics?foo=1')),
      ).resolves.toBe(true);
    });

    /**
     * **這支是這一塊的重點。**
     *
     * 原本用 `startsWith('/api/metrics')`，它的性質是「未來新增的任何
     * /api/metrics 開頭路由自動免認證」——而那不會有任何錯誤訊息提醒你。
     * 今天沒有這種路由，所以這支測試在改動前也是紅的（豁免範圍過寬）。
     */
    it('⭐ /api/metrics-secret → 不得放行', async () => {
      await expect(
        guard.canActivate(makeContext(undefined, '/api/metrics-secret')),
      ).rejects.toThrow();
    });
  });

  it('無 Authorization header → UnauthorizedException', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockResolve.resolve).not.toHaveBeenCalled();
  });

  it('Bearer token → 交給 ResolveMemberContextUseCase 判定', async () => {
    // token 的實際驗證邏輯全在該 use case，本 guard 只負責取出與轉交。
    // 兩條路徑（HTTP / WebSocket）共用同一個實作是刻意的設計。
    await expect(guard.canActivate(makeContext('Bearer valid'))).resolves.toBe(
      true,
    );
    expect(mockResolve.resolve).toHaveBeenCalledWith('valid');
  });

  it('use case 拋出時原樣往外傳，不吞掉', async () => {
    mockResolve.resolve.mockRejectedValue(
      new UnauthorizedException('Token 已失效，請重新登入'),
    );

    await expect(
      guard.canActivate(makeContext('Bearer stale')),
    ).rejects.toThrow(UnauthorizedException);
  });

  describe('密碼到期（HTTP 專屬，不下沉到共用層）', () => {
    it('flag 關閉 → 不檢查', async () => {
      mockResolve.resolve.mockResolvedValue({
        ...memberContext,
        lastPasswordChange: null,
      });

      await expect(
        guard.canActivate(makeContext('Bearer valid')),
      ).resolves.toBe(true);
    });

    it('flag 開啟且從未改過密碼 → PasswordChangeRequiredException', async () => {
      mockFeatureFlags.isEnabled.mockReturnValue(true);
      mockResolve.resolve.mockResolvedValue({
        ...memberContext,
        lastPasswordChange: null,
      });

      await expect(
        guard.canActivate(makeContext('Bearer valid')),
      ).rejects.toThrow(PasswordChangeRequiredException);
    });

    it('flag 開啟且密碼已過期 → PasswordChangeRequiredException', async () => {
      mockFeatureFlags.isEnabled.mockReturnValue(true);
      const longAgo = new Date();
      longAgo.setFullYear(longAgo.getFullYear() - 2);
      mockResolve.resolve.mockResolvedValue({
        ...memberContext,
        lastPasswordChange: longAgo.toISOString(),
      });

      await expect(
        guard.canActivate(makeContext('Bearer valid')),
      ).rejects.toThrow(PasswordChangeRequiredException);
    });

    it('flag 開啟且密碼未過期 → 通過', async () => {
      mockFeatureFlags.isEnabled.mockReturnValue(true);
      mockResolve.resolve.mockResolvedValue({
        ...memberContext,
        lastPasswordChange: new Date().toISOString(),
      });

      await expect(
        guard.canActivate(makeContext('Bearer valid')),
      ).resolves.toBe(true);
    });
  });
});
