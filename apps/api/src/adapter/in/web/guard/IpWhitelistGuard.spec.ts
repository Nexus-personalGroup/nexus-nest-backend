import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IpWhitelistGuard } from './IpWhitelistGuard';
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
  isWhitelisted: jest.fn(),
} as unknown as jest.Mocked<IpListPort>;

const makeFlags = (enabled: boolean) =>
  ({ isEnabled: jest.fn(() => enabled) }) as unknown as FeatureFlagService;

/** marked=true 模擬路由掛了 @InfraEndpoint() */
const makeReflector = (marked = false) =>
  ({ getAllAndOverride: jest.fn(() => marked) }) as unknown as Reflector;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('IpWhitelistGuard', () => {
  it('功能關閉 → 直接放行，不查名單', async () => {
    const guard = new IpWhitelistGuard(
      makeFlags(false),
      makeReflector(),
      mockIpList,
    );

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockIpList.isWhitelisted).not.toHaveBeenCalled();
  });

  it('啟用且 IP 在白名單 → 放行', async () => {
    (mockIpList.isWhitelisted as jest.Mock).mockResolvedValue(true);
    const guard = new IpWhitelistGuard(
      makeFlags(true),
      makeReflector(),
      mockIpList,
    );

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockIpList.isWhitelisted).toHaveBeenCalledWith('1.2.3.4');
  });

  it('啟用且 IP 不在白名單 → 拋 ForbiddenException', async () => {
    (mockIpList.isWhitelisted as jest.Mock).mockResolvedValue(false);
    const guard = new IpWhitelistGuard(
      makeFlags(true),
      makeReflector(),
      mockIpList,
    );

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('啟用但無 IP → 拋 ForbiddenException', async () => {
    const guard = new IpWhitelistGuard(
      makeFlags(true),
      makeReflector(),
      mockIpList,
    );

    await expect(
      guard.canActivate(makeContext(undefined as unknown as string)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('基礎設施探針的豁免', () => {
    it('⭐ 標了 @InfraEndpoint() 的路由 → 白名單啟用時仍放行，且不查名單', async () => {
      (mockIpList.isWhitelisted as jest.Mock).mockResolvedValue(false);
      const guard = new IpWhitelistGuard(
        makeFlags(true),
        makeReflector(true),
        mockIpList,
      );

      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
      expect(mockIpList.isWhitelisted).not.toHaveBeenCalled();
    });

    it('⭐ /api/metrics → 白名單啟用時仍放行（第三方 controller 掛不上裝飾器）', async () => {
      (mockIpList.isWhitelisted as jest.Mock).mockResolvedValue(false);
      const guard = new IpWhitelistGuard(
        makeFlags(true),
        makeReflector(),
        mockIpList,
      );

      await expect(
        guard.canActivate(makeContext('1.2.3.4', '/api/metrics?name[]=x')),
      ).resolves.toBe(true);
    });

    // 缺這一半的話「一律放行」也會綠——豁免必須是有邊界的
    it('⭐ 未標記且非豁免路徑 → 白名單啟用時仍被擋', async () => {
      (mockIpList.isWhitelisted as jest.Mock).mockResolvedValue(false);
      const guard = new IpWhitelistGuard(
        makeFlags(true),
        makeReflector(),
        mockIpList,
      );

      await expect(
        guard.canActivate(makeContext('1.2.3.4', '/api/metrics-summary')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
