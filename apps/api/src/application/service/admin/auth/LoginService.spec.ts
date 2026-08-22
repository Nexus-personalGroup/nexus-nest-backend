import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginService } from './LoginService';
import { FeatureFlagService } from '../../shared/FeatureFlagService';
import { LoadMemberPort } from '../../../port/out/member/LoadMemberPort';
import { SaveMemberPort } from '../../../port/out/member/SaveMemberPort';
import { SaveAuthLogPort } from '../../../port/out/auth/SaveAuthLogPort';
import { AccountLockPort } from '../../../port/out/auth/AccountLockPort';
import { IpBlockPort } from '../../../port/out/security/IpBlockPort';
import { IpListPort } from '../../../port/out/security/IpListPort';
import { RecaptchaVerifyPort } from '../../../port/out/auth/RecaptchaVerifyPort';
import { SessionActivityPort } from '../../../port/out/auth/SessionActivityPort';
import { Member } from '@app/domain/model/Member';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';
import { AccountLockedException } from '@app/domain/exception/AccountLockedException';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  // 帳號不存在時用來抹平時間差的假 hash
  hashSync: jest.fn().mockReturnValue('$2b$04$dummy'),
}));

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    ACCESS_SECRET: 'test-access-secret',
    ACCESS_TOKEN_EXPIRES_IN: 7200,
    REFRESH_SECRET: 'test-refresh-secret',
    REFRESH_TOKEN_EXPIRES_IN: 604800,
    APPLICATION_SESSION_IDLE_TIMEOUT: 120,
    APPLICATION_ACCOUNT_LOCK_THRESHOLD: 3,
    APPLICATION_IP_BLOCK_THRESHOLD: 5,
  }),
}));

const MEMBER_ID = '00000000-0000-0000-0000-000000000001';
const ROLE_ID = '00000000-0000-0000-0000-000000000002';

const makeMember = (status = true) =>
  Member.reconstitute(
    MEMBER_ID,
    'admin@test.com',
    'Admin',
    '$2b$10$hashed',
    ROLE_ID,
    status,
    false,
    new Date(),
    'Admin',
  );

const mockLoadMember = {
  loadMemberByEmail: jest.fn(),
  loadMemberById: jest.fn(),
  loadMemberDomainById: jest.fn(),
  existsByEmail: jest.fn(),
  findActiveMemberIds: jest.fn(),
  listMembers: jest.fn(),
  loadMemberContext: jest.fn(),
} as unknown as jest.Mocked<LoadMemberPort>;

const mockSaveAuthLog = {
  saveAuthLog: jest.fn(),
} as jest.Mocked<SaveAuthLogPort>;

const mockSaveMember = {
  createMember: jest.fn(),
  updateMember: jest.fn(),
  saveMemberWithPassword: jest.fn(),
  deleteMember: jest.fn(),
  updateLastLoginAt: jest.fn().mockResolvedValue(undefined),
  incrementTokenVersion: jest.fn(),
} as jest.Mocked<SaveMemberPort>;

const mockAccountLock = {
  checkLock: jest.fn().mockResolvedValue('NONE'),
  lockAccount: jest.fn(),
  recordFailedLogin: jest.fn().mockResolvedValue(0),
  resetFailedLogin: jest.fn(),
  unlockAccount: jest.fn(),
} as unknown as jest.Mocked<AccountLockPort>;

const mockIpBlock = {
  recordFailedIpAttempt: jest.fn().mockResolvedValue(0),
  resetIpAttempts: jest.fn(),
} as jest.Mocked<IpBlockPort>;

const mockIpList = {
  addToBlacklist: jest.fn(),
  removeFromBlacklist: jest.fn(),
  isBlacklisted: jest.fn(),
  listBlacklist: jest.fn(),
  addToWhitelist: jest.fn(),
  removeFromWhitelist: jest.fn(),
  isWhitelisted: jest.fn(),
  listWhitelist: jest.fn(),
} as unknown as jest.Mocked<IpListPort>;

const mockRecaptcha = {
  verify: jest.fn().mockResolvedValue(true),
} as jest.Mocked<RecaptchaVerifyPort>;

const mockSessionActivity = {
  touchActivity: jest.fn(),
  getLastActivity: jest.fn(),
  isActive: jest.fn(),
} as unknown as jest.Mocked<SessionActivityPort>;

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock-token'),
} as unknown as jest.Mocked<JwtService>;

const makeFeatureFlags = (overrides: Partial<Record<string, boolean>> = {}) =>
  ({
    isEnabled: jest.fn((flag: string) => overrides[flag] ?? false),
    onModuleInit: jest.fn(),
  }) as unknown as FeatureFlagService;

const makeService = (flags?: FeatureFlagService) =>
  new LoginService(
    mockLoadMember,
    mockSaveMember,
    mockSaveAuthLog,
    mockAccountLock,
    mockIpBlock,
    mockIpList,
    mockRecaptcha,
    mockSessionActivity,
    mockJwt,
    flags ?? makeFeatureFlags(),
  );

describe('LoginService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockJwt.sign as jest.Mock).mockReturnValue('mock-token');
  });

  it('正確憑證 → 回傳 accessToken、refreshToken 及會員資訊', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await makeService().execute({
      email: 'admin@test.com',
      password: 'Password1!',
    });

    expect(result.accessToken).toBe('mock-token');
    expect(result.refreshToken).toBe('mock-token');
    expect(result.member.id).toBe(MEMBER_ID);
    expect(mockJwt.sign).toHaveBeenCalledTimes(2);
  });

  it('登入成功 → 觸發 updateLastLoginAt（fire-and-forget）', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockSaveMember.updateLastLoginAt.mockClear();

    await makeService().execute({
      email: 'admin@test.com',
      password: 'Password1!',
    });

    expect(mockSaveMember.updateLastLoginAt).toHaveBeenCalledWith(MEMBER_ID);
    expect(mockSaveMember.updateLastLoginAt).toHaveBeenCalledTimes(1);
  });

  it('updateLastLoginAt 失敗不應阻擋登入流程（catch + warn）', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockSaveMember.updateLastLoginAt.mockRejectedValueOnce(
      new Error('DB down'),
    );

    const result = await makeService().execute({
      email: 'admin@test.com',
      password: 'Password1!',
    });

    expect(result.accessToken).toBe('mock-token');
  });

  it('會員不存在 → 拋出 UnauthorizedException', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(null);

    await expect(
      makeService().execute({ email: 'no@test.com', password: 'pw' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  // 少了這一步，「帳號不存在」會比「密碼錯誤」快約一個 bcrypt 的時間（rounds=12 下約 100ms），
  // 訊息雖然統一，回應時間仍足以用來列舉帳號
  it('會員不存在 → 仍執行一次 bcrypt 比對以抹平時間差', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(null);
    const compare = jest.mocked(bcrypt.compare);
    compare.mockClear();

    await expect(
      makeService().execute({ email: 'no@test.com', password: 'pw' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(compare).toHaveBeenCalledTimes(1);
  });

  it('密碼錯誤 → 拋出 UnauthorizedException', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      makeService().execute({ email: 'admin@test.com', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('帳號已停用（status=false）→ 拋出 AccountDisabledException', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(false),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      makeService().execute({
        email: 'admin@test.com',
        password: 'Password1!',
      }),
    ).rejects.toThrow(AccountDisabledException);
  });

  /**
   * 原本這支斷言的是 `ForbiddenException`（403），而 `api-auth` 的 spec 寫的是
   * `423` + `ACCOUNT_LOCKED`——`AccountLockedException` 一直存在但沒有被用。
   * 測試把實作的漂移一起釘住了，於是沒有人發現。
   */
  it('帳號鎖定功能啟用且仍在時效內 → 拋出 AccountLockedException（423）', async () => {
    (mockAccountLock.checkLock as jest.Mock).mockResolvedValue('LOCKED');
    const service = makeService(makeFeatureFlags({ accountLockEnabled: true }));

    await expect(
      service.execute({ email: 'admin@test.com', password: 'pw' }),
    ).rejects.toThrow(AccountLockedException);
    expect(mockLoadMember.loadMemberByEmail).not.toHaveBeenCalled();
  });

  /**
   * **到期時必須一併清掉失敗計數。**
   *
   * 計數在 Redis 且 TTL（30 分鐘）比預設時效（15 分鐘）長。少了這一步，
   * 使用者在到期後第一次打錯就會因為「計數還在閾值上」立刻重新被鎖，
   * 實際鎖定時間變成計數的 TTL 而非設定的時效——而設定的那個數字看起來完全正常。
   */
  it('鎖定已到期 → 放行，繼續走正常登入流程', async () => {
    (mockAccountLock.checkLock as jest.Mock).mockResolvedValue('EXPIRED');
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const service = makeService(makeFeatureFlags({ accountLockEnabled: true }));

    await service.execute({ email: 'admin@test.com', password: 'Password1!' });

    expect(mockLoadMember.loadMemberByEmail).toHaveBeenCalled();
  });

  /**
   * **到期時的清除必須發生在「這次登入成不成功」之前。**
   *
   * 用「密碼打錯」來驗，因為登入成功本來就會重置計數——那條路徑會蓋掉真正要驗的東西。
   * 少了到期時的清除，使用者在鎖定到期後第一次打錯就會因為「計數還在閾值上」
   * 立刻重新被鎖，實際鎖定時間變成 Redis 計數的 TTL（30 分鐘）而非設定的時效。
   */
  it('⭐ 到期後即使密碼又打錯，失敗計數仍已在檢查時被清除', async () => {
    (mockAccountLock.checkLock as jest.Mock).mockResolvedValue('EXPIRED');
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const service = makeService(makeFeatureFlags({ accountLockEnabled: true }));

    await expect(
      service.execute({ email: 'admin@test.com', password: '錯的密碼' }),
    ).rejects.toThrow();

    expect(mockAccountLock.resetFailedLogin).toHaveBeenCalledWith(
      'admin@test.com',
    );
  });

  // 從未鎖定的帳號不該被當成「剛到期」而多做一次清除
  it('從未鎖定且密碼錯誤 → 不清除失敗計數', async () => {
    (mockAccountLock.checkLock as jest.Mock).mockResolvedValue('NONE');
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      makeMember(),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const service = makeService(makeFeatureFlags({ accountLockEnabled: true }));

    await expect(
      service.execute({ email: 'admin@test.com', password: '錯的密碼' }),
    ).rejects.toThrow();

    expect(mockAccountLock.resetFailedLogin).not.toHaveBeenCalled();
  });
});
