import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { IpWhitelistGuard } from './IpWhitelistGuard';
import { IpListPort } from '@app/application/port/out/security/IpListPort';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';

const makeContext = (ip = '1.2.3.4'): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  }) as unknown as ExecutionContext;

const mockIpList = {
  isWhitelisted: jest.fn(),
} as unknown as jest.Mocked<IpListPort>;

const makeFlags = (enabled: boolean) =>
  ({ isEnabled: jest.fn(() => enabled) }) as unknown as FeatureFlagService;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('IpWhitelistGuard', () => {
  it('功能關閉 → 直接放行，不查名單', async () => {
    const guard = new IpWhitelistGuard(makeFlags(false), mockIpList);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockIpList.isWhitelisted).not.toHaveBeenCalled();
  });

  it('啟用且 IP 在白名單 → 放行', async () => {
    (mockIpList.isWhitelisted as jest.Mock).mockResolvedValue(true);
    const guard = new IpWhitelistGuard(makeFlags(true), mockIpList);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockIpList.isWhitelisted).toHaveBeenCalledWith('1.2.3.4');
  });

  it('啟用且 IP 不在白名單 → 拋 ForbiddenException', async () => {
    (mockIpList.isWhitelisted as jest.Mock).mockResolvedValue(false);
    const guard = new IpWhitelistGuard(makeFlags(true), mockIpList);

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('啟用但無 IP → 拋 ForbiddenException', async () => {
    const guard = new IpWhitelistGuard(makeFlags(true), mockIpList);

    await expect(
      guard.canActivate(makeContext(undefined as unknown as string)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
