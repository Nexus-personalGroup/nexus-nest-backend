import { JwtService } from '@nestjs/jwt';
import { LogoutService } from './LogoutService';
import { TokenBlacklistPort } from '../../../port/out/auth/TokenBlacklistPort';
import { ClearMemberContextPort } from '../../../port/out/member/ClearMemberContextPort';
import { SaveAuthLogPort } from '../../../port/out/auth/SaveAuthLogPort';
import { FeatureFlagService } from '../../shared/FeatureFlagService';

jest.mock('../../../../infrastructure/validate-env', () => ({
  getEnv: () => ({
    ACCESS_SECRET: 'test-access-secret',
    REFRESH_SECRET: 'test-refresh-secret',
    ACCESS_TOKEN_EXPIRES_IN: 7200,
    REFRESH_TOKEN_EXPIRES_IN: 604800,
  }),
}));

const mockJwt = {
  verify: jest.fn(),
} as unknown as jest.Mocked<JwtService>;

const mockTokenBlacklist = {
  addToBlacklist: jest.fn(),
  isBlacklisted: jest.fn(),
} as unknown as jest.Mocked<TokenBlacklistPort>;

const mockClearContext = {
  clearMemberContext: jest.fn(),
} as unknown as jest.Mocked<ClearMemberContextPort>;

const mockSaveAuthLog = {
  saveAuthLog: jest.fn(),
} as jest.Mocked<SaveAuthLogPort>;

const makeFeatureFlags = (overrides: Partial<Record<string, boolean>> = {}) =>
  ({
    isEnabled: jest.fn((flag: string) => overrides[flag] ?? false),
  }) as unknown as FeatureFlagService;

const makeService = (flags?: FeatureFlagService) =>
  new LogoutService(
    mockJwt,
    mockTokenBlacklist,
    mockClearContext,
    mockSaveAuthLog,
    flags ?? makeFeatureFlags(),
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LogoutService', () => {
  it('只給有效 access token → blacklist 一次並清除 MemberContext', async () => {
    (mockJwt.verify as jest.Mock).mockReturnValue({ sub: 'member-1' });

    await makeService().execute({ accessToken: 'acc' });

    expect(mockTokenBlacklist.addToBlacklist).toHaveBeenCalledTimes(1);
    expect(mockTokenBlacklist.addToBlacklist).toHaveBeenCalledWith(
      'acc',
      7200,
      'logout',
    );
    expect(mockClearContext.clearMemberContext).toHaveBeenCalledWith(
      'member-1',
    );
  });

  it('access + refresh 皆有效 → blacklist 兩次', async () => {
    (mockJwt.verify as jest.Mock).mockReturnValue({ sub: 'member-1' });

    await makeService().execute({ accessToken: 'acc', refreshToken: 'ref' });

    expect(mockTokenBlacklist.addToBlacklist).toHaveBeenCalledTimes(2);
  });

  it('access token 驗證失敗 → 不 blacklist、不清快取（best-effort）', async () => {
    (mockJwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('invalid');
    });

    await makeService().execute({ accessToken: 'bad' });

    expect(mockTokenBlacklist.addToBlacklist).not.toHaveBeenCalled();
    expect(mockClearContext.clearMemberContext).not.toHaveBeenCalled();
  });

  it('authLog flag 開啟 → 寫入 LOGOUT 日誌', async () => {
    (mockJwt.verify as jest.Mock).mockReturnValue({ sub: 'member-1' });
    const service = makeService(makeFeatureFlags({ authLogEnabled: true }));

    await service.execute({ accessToken: 'acc', email: 'u@test.com' });

    expect(mockSaveAuthLog.saveAuthLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGOUT', memberId: 'member-1' }),
    );
  });

  it('token 已過期（ttl<=0）→ 不 blacklist，但仍清快取', async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 100;
    (mockJwt.verify as jest.Mock).mockReturnValue({
      sub: 'member-1',
      exp: pastExp,
    });

    await makeService().execute({ accessToken: 'acc' });

    expect(mockTokenBlacklist.addToBlacklist).not.toHaveBeenCalled();
    expect(mockClearContext.clearMemberContext).toHaveBeenCalledWith(
      'member-1',
    );
  });
});
