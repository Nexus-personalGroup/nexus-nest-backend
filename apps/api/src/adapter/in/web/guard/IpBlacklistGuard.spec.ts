import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IpBlacklistGuard } from './IpBlacklistGuard';
import { IpListPort } from '@app/application/port/out/security/IpListPort';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';

const makeContext = (
  ip = '1.2.3.4',
  url = '/api/admin/members',
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ ip, originalUrl: url }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

const mockIpList = {
  isBlacklisted: jest.fn(),
} as unknown as jest.Mocked<IpListPort>;

const makeFlags = (enabled: boolean) =>
  ({ isEnabled: jest.fn(() => enabled) }) as unknown as FeatureFlagService;

/** marked=true 模擬路由掛了 @InfraEndpoint() */
const makeReflector = (marked = false) =>
  ({ getAllAndOverride: jest.fn(() => marked) }) as unknown as Reflector;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('IpBlacklistGuard', () => {
  it('功能關閉 → 直接放行，不查名單', async () => {
    const guard = new IpBlacklistGuard(
      makeFlags(false),
      makeReflector(),
      mockIpList,
    );

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockIpList.isBlacklisted).not.toHaveBeenCalled();
  });

  it('啟用且 IP 不在黑名單 → 放行', async () => {
    (mockIpList.isBlacklisted as jest.Mock).mockResolvedValue(false);
    const guard = new IpBlacklistGuard(
      makeFlags(true),
      makeReflector(),
      mockIpList,
    );

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockIpList.isBlacklisted).toHaveBeenCalledWith('1.2.3.4');
  });

  it('啟用且 IP 在黑名單 → 拋 ForbiddenException', async () => {
    (mockIpList.isBlacklisted as jest.Mock).mockResolvedValue(true);
    const guard = new IpBlacklistGuard(
      makeFlags(true),
      makeReflector(),
      mockIpList,
    );

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  describe('基礎設施探針的豁免', () => {
    it('⭐ 標了 @InfraEndpoint() 的路由 → 黑名單啟用時仍放行，且不查名單', async () => {
      (mockIpList.isBlacklisted as jest.Mock).mockResolvedValue(true);
      const guard = new IpBlacklistGuard(
        makeFlags(true),
        makeReflector(true),
        mockIpList,
      );

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
      expect(mockIpList.isBlacklisted).not.toHaveBeenCalled();
    });

    // 這一條是本次最重要的邊界：登入端點是 @Public()，若豁免依據誤用 @Public()，
    // 黑名單對登入就失效了——而擋惡意來源打登入正是這個功能存在的主要理由
    it('⭐ 未標記的路由（例如登入）→ 黑名單啟用時仍被擋', async () => {
      (mockIpList.isBlacklisted as jest.Mock).mockResolvedValue(true);
      const guard = new IpBlacklistGuard(
        makeFlags(true),
        makeReflector(),
        mockIpList,
      );

      await expect(
        guard.canActivate(makeContext('1.2.3.4', '/api/admin/auth/login')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
