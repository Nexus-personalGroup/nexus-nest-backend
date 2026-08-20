import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionIdleGuard } from './SessionIdleGuard';
import { SessionActivityPort } from '@app/application/port/out/auth/SessionActivityPort';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({ APPLICATION_SESSION_IDLE_TIMEOUT: 120 }),
}));

const makeContext = (member?: { sub: string }): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ member }) }),
  }) as unknown as ExecutionContext;

const mockSessionActivity = {
  isActive: jest.fn(),
  touchActivity: jest.fn(),
} as unknown as jest.Mocked<SessionActivityPort>;

const makeFlags = (enabled: boolean) =>
  ({ isEnabled: jest.fn(() => enabled) }) as unknown as FeatureFlagService;

const makeGuard = (enabled: boolean) =>
  new SessionIdleGuard(makeFlags(enabled), mockSessionActivity);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SessionIdleGuard', () => {
  it('功能關閉 → 放行，不查活動狀態', async () => {
    await expect(makeGuard(false).canActivate(makeContext())).resolves.toBe(
      true,
    );
    expect(mockSessionActivity.isActive).not.toHaveBeenCalled();
  });

  it('未認證（無 member）→ 放行', async () => {
    await expect(makeGuard(true).canActivate(makeContext())).resolves.toBe(
      true,
    );
    expect(mockSessionActivity.isActive).not.toHaveBeenCalled();
  });

  it('session 仍活躍 → 放行並刷新活動時間', async () => {
    (mockSessionActivity.isActive as jest.Mock).mockResolvedValue(true);

    await expect(
      makeGuard(true).canActivate(makeContext({ sub: 'm1' })),
    ).resolves.toBe(true);
    expect(mockSessionActivity.touchActivity).toHaveBeenCalledWith('m1', 120);
  });

  it('session 已閒置過期 → 拋 UnauthorizedException', async () => {
    (mockSessionActivity.isActive as jest.Mock).mockResolvedValue(false);

    await expect(
      makeGuard(true).canActivate(makeContext({ sub: 'm1' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockSessionActivity.touchActivity).not.toHaveBeenCalled();
  });
});
