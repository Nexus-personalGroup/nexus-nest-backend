import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { IpBlacklistGuard } from './IpBlacklistGuard';
import { IpListPort } from '@app/application/port/out/security/IpListPort';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';

const makeContext = (ip = '1.2.3.4'): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  }) as unknown as ExecutionContext;

const mockIpList = {
  isBlacklisted: jest.fn(),
} as unknown as jest.Mocked<IpListPort>;

const makeFlags = (enabled: boolean) =>
  ({ isEnabled: jest.fn(() => enabled) }) as unknown as FeatureFlagService;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('IpBlacklistGuard', () => {
  it('功能關閉 → 直接放行，不查名單', async () => {
    const guard = new IpBlacklistGuard(makeFlags(false), mockIpList);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockIpList.isBlacklisted).not.toHaveBeenCalled();
  });

  it('啟用且 IP 不在黑名單 → 放行', async () => {
    (mockIpList.isBlacklisted as jest.Mock).mockResolvedValue(false);
    const guard = new IpBlacklistGuard(makeFlags(true), mockIpList);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockIpList.isBlacklisted).toHaveBeenCalledWith('1.2.3.4');
  });

  it('啟用且 IP 在黑名單 → 拋 ForbiddenException', async () => {
    (mockIpList.isBlacklisted as jest.Mock).mockResolvedValue(true);
    const guard = new IpBlacklistGuard(makeFlags(true), mockIpList);

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
