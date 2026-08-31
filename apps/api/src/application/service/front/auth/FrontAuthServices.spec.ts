import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { FrontLoginService } from './FrontLoginService';
import type { IpBlockPort } from '@app/application/port/out/security/IpBlockPort';
import type { IpListPort } from '@app/application/port/out/security/IpListPort';
import type { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';
import { FrontRefreshTokenService } from './FrontRefreshTokenService';
import { ResolveUserContextService } from './ResolveUserContextService';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';
import type { LoadUserPort } from '@app/application/port/out/user/LoadUserPort';
import type { TokenBlacklistPort } from '@app/application/port/out/auth/TokenBlacklistPort';
import type { JwtService } from '@nestjs/jwt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hashSync: jest.fn(() => '$2b$10$dummy'),
}));

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    BCRYPT_ROUNDS: 10,
    ACCESS_SECRET: 'admin-access-secret-min-32-characters!',
    REFRESH_SECRET: 'admin-refresh-secret-min-32-character',
    FRONT_ACCESS_SECRET: 'front-access-secret-min-32-characters',
    FRONT_REFRESH_SECRET: 'front-refresh-secret-min-32-character',
    ACCESS_TOKEN_EXPIRES_IN: 7200,
    REFRESH_TOKEN_EXPIRES_IN: 604800,
    APPLICATION_IP_BLOCK_THRESHOLD: 5,
  }),
}));

const makeUser = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'user-1',
  email: 'user1@test.com',
  password: '$2b$10$hashed',
  displayName: '小明',
  avatarUrl: null,
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  status: true,
  tokenVersion: 0,
  lastSeenAt: null,
  createdAt: new Date(0),
  ...over,
});

const makeLoadUser = () =>
  ({
    loadByEmail: jest.fn(),
    loadById: jest.fn(),
    touchLastSeen: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<LoadUserPort>;

const makeJwt = () =>
  ({
    sign: jest.fn(() => 'signed-token'),
    verify: jest.fn(),
  }) as unknown as jest.Mocked<JwtService>;

const makeIpBlock = () =>
  ({
    recordFailedIpAttempt: jest.fn().mockResolvedValue(1),
    resetIpAttempts: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<IpBlockPort>;

const makeIpList = () =>
  ({
    addToBlacklist: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<IpListPort>;

/** 預設開啟 IP 黑名單，否則計數整段被跳過 */
const makeFlags = (enabled = true) =>
  ({
    isEnabled: jest.fn().mockReturnValue(enabled),
  }) as unknown as jest.Mocked<FeatureFlagService>;

const makeBlacklist = () =>
  ({
    addToBlacklist: jest.fn().mockResolvedValue(undefined),
    isBlacklisted: jest.fn().mockResolvedValue(false),
    getBlacklistReason: jest.fn(),
  }) as unknown as jest.Mocked<TokenBlacklistPort>;

describe('FrontLoginService', () => {
  let loadUser: jest.Mocked<LoadUserPort>;
  let jwt: jest.Mocked<JwtService>;
  let ipBlock: jest.Mocked<IpBlockPort>;
  let ipList: jest.Mocked<IpListPort>;
  let flags: jest.Mocked<FeatureFlagService>;
  let service: FrontLoginService;

  beforeEach(() => {
    jest.clearAllMocks();
    loadUser = makeLoadUser();
    jwt = makeJwt();
    ipBlock = makeIpBlock();
    ipList = makeIpList();
    flags = makeFlags();
    service = new FrontLoginService(loadUser, jwt, ipBlock, ipList, flags);
  });

  it('登入成功回傳 token 對與使用者摘要', async () => {
    loadUser.loadByEmail.mockResolvedValue(makeUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.execute({
      email: 'user1@test.com',
      password: 'User1234!',
    });

    expect(result.user).toEqual({
      id: 'user-1',
      email: 'user1@test.com',
      displayName: '小明',
      emailVerified: true,
      avatarUrl: null,
    });
    expect(result.accessToken).toBe('signed-token');
  });

  /**
   * 簽發用的是**前台專屬的 secret**。
   *
   * 側別的第一道防線是 secret 而非 payload 裡的 `side`：某處忘了比對 side 時，
   * 前者的後果是簽章驗證失敗（fail-closed），後者的後果是跨側存取。
   */
  it('⭐ 用前台 secret 簽發，payload 帶 side: front', async () => {
    loadUser.loadByEmail.mockResolvedValue(makeUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await service.execute({ email: 'user1@test.com', password: 'pw' });

    const [payload, options] = jwt.sign.mock.calls[0];
    expect(payload).toMatchObject({ type: 'access', side: 'front' });
    expect(options).toMatchObject({
      secret: 'front-access-secret-min-32-characters',
    });
  });

  /**
   * 少了這一步，「帳號不存在」會比「密碼錯誤」快約一個 bcrypt 的時間，
   * 穩定可測，足以用來列舉帳號。
   */
  it('⭐ 帳號不存在時仍執行一次 bcrypt', async () => {
    loadUser.loadByEmail.mockResolvedValue(null);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.execute({ email: 'ghost@test.com', password: 'pw' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it('密碼錯誤與帳號不存在的訊息一致', async () => {
    loadUser.loadByEmail.mockResolvedValue(makeUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const wrongPassword = await service
      .execute({ email: 'user1@test.com', password: 'wrong' })
      .catch((e: Error) => e.message);

    loadUser.loadByEmail.mockResolvedValue(null);
    const noAccount = await service
      .execute({ email: 'ghost@test.com', password: 'pw' })
      .catch((e: Error) => e.message);

    expect(wrongPassword).toBe(noAccount);
  });

  /**
   * 狀態檢查排在密碼比對**之後**。
   *
   * 先檢查的話，「這個帳號被停權了」會變成一個不需要密碼就能問出來的事實。
   */
  it('⭐ 停權的帳號密碼正確 → 403，且檢查在密碼比對之後', async () => {
    loadUser.loadByEmail.mockResolvedValue(makeUser({ status: false }));
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      service.execute({ email: 'user1@test.com', password: 'User1234!' }),
    ).rejects.toThrow(AccountDisabledException);
    expect(bcrypt.compare).toHaveBeenCalled();
  });

  it('停權的帳號密碼錯誤 → 仍回 401（不洩漏停權狀態）', async () => {
    loadUser.loadByEmail.mockResolvedValue(makeUser({ status: false }));
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.execute({ email: 'user1@test.com', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('登入成功更新 lastSeenAt', async () => {
    loadUser.loadByEmail.mockResolvedValue(makeUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await service.execute({ email: 'user1@test.com', password: 'pw' });

    expect(loadUser.touchLastSeen).toHaveBeenCalledWith('user-1');
  });

  // members 那套（failedLoginCount + lockedAt）是未認證者可觸發的 DoS 面
  it('⭐ 連續失敗不會鎖定帳號（沒有任何鎖定機制）', async () => {
    loadUser.loadByEmail.mockResolvedValue(makeUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    for (let i = 0; i < 5; i += 1) {
      await service
        .execute({ email: 'user1@test.com', password: 'wrong' })
        .catch(() => undefined);
    }

    // 第六次密碼對了就該過——沒有任何東西記得前五次
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(
      service.execute({ email: 'user1@test.com', password: 'right' }),
    ).resolves.toBeDefined();
  });

  /**
   * IP 失敗計數。
   *
   * 這條防線**曾經只存在於註解裡**：`FrontLoginService` 的註解寫著防護交給
   * `APPLICATION_IP_BLOCK_THRESHOLD`，但 `recordFailedIpAttempt` 從來沒有被
   * 前台呼叫過。**只注入不呼叫、或只寫在註解裡，都是同一種殘骸。**
   */
  describe('IP 失敗計數', () => {
    const IP = '203.0.113.7';
    const loginWithIp = () =>
      service.execute({
        email: 'user1@test.com',
        password: 'wrong',
        ip: IP,
      });

    it('⭐ 密碼錯誤 → 遞增該 IP 的失敗計數', async () => {
      loadUser.loadByEmail.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(loginWithIp()).rejects.toThrow();

      expect(ipBlock.recordFailedIpAttempt).toHaveBeenCalledWith(IP);
    });

    // 帳號不存在也要計數，否則攻擊者用不存在的信箱就能繞過整條防線
    it('⭐ 帳號不存在 → 同樣遞增', async () => {
      loadUser.loadByEmail.mockResolvedValue(null);

      await expect(loginWithIp()).rejects.toThrow();

      expect(ipBlock.recordFailedIpAttempt).toHaveBeenCalledWith(IP);
    });

    it('⭐ 達到門檻 → 自動加入黑名單', async () => {
      loadUser.loadByEmail.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      ipBlock.recordFailedIpAttempt.mockResolvedValue(5);

      await expect(loginWithIp()).rejects.toThrow();

      expect(ipList.addToBlacklist).toHaveBeenCalledWith(
        IP,
        expect.stringContaining('自動封鎖'),
        true,
      );
    });

    it('未達門檻不加入黑名單', async () => {
      loadUser.loadByEmail.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      ipBlock.recordFailedIpAttempt.mockResolvedValue(4);

      await expect(loginWithIp()).rejects.toThrow();

      expect(ipList.addToBlacklist).not.toHaveBeenCalled();
    });

    // 零星打錯的使用者不該慢慢累積到門檻
    it('⭐ 登入成功 → 重置該 IP 的失敗計數', async () => {
      loadUser.loadByEmail.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.execute({
        email: 'user1@test.com',
        password: 'User1234!',
        ip: IP,
      });

      expect(ipBlock.resetIpAttempts).toHaveBeenCalledWith(IP);
      expect(ipBlock.recordFailedIpAttempt).not.toHaveBeenCalled();
    });

    it('取不到 IP 時整段略過', async () => {
      loadUser.loadByEmail.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.execute({ email: 'user1@test.com', password: 'wrong' }),
      ).rejects.toThrow();

      expect(ipBlock.recordFailedIpAttempt).not.toHaveBeenCalled();
    });

    it('功能開關關閉時不計數', async () => {
      flags.isEnabled.mockReturnValue(false);
      loadUser.loadByEmail.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(loginWithIp()).rejects.toThrow();

      expect(ipBlock.recordFailedIpAttempt).not.toHaveBeenCalled();
    });
  });
});

describe('ResolveUserContextService', () => {
  let loadUser: jest.Mocked<LoadUserPort>;
  let jwt: jest.Mocked<JwtService>;
  let blacklist: jest.Mocked<TokenBlacklistPort>;
  let service: ResolveUserContextService;

  beforeEach(() => {
    jest.clearAllMocks();
    loadUser = makeLoadUser();
    jwt = makeJwt();
    blacklist = makeBlacklist();
    service = new ResolveUserContextService(jwt, blacklist, loadUser);
    loadUser.loadById.mockResolvedValue(makeUser());
  });

  it('有效的前台 access token → 回傳 UserContext', async () => {
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      type: 'access',
      side: 'front',
      tokenVersion: 0,
    });

    await expect(service.resolve('token')).resolves.toEqual({
      sub: 'user-1',
      email: 'user1@test.com',
      displayName: '小明',
      status: true,
      emailVerified: true,
      tokenVersion: 0,
    });
  });

  /**
   * 驗證狀態每次解析都重算，**不快取在 token 裡**——
   * 快取的話使用者驗證完還得重新登入才能聊天。
   */
  it('⭐ 未驗證的帳號 → emailVerified 為 false，但仍解析成功', async () => {
    loadUser.loadById.mockResolvedValue(makeUser({ emailVerifiedAt: null }));
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      type: 'access',
      side: 'front',
      tokenVersion: 0,
    });

    const context = await service.resolve('token');

    expect(context.emailVerified).toBe(false);
    expect(context.sub).toBe('user-1');
  });

  it('⭐ 用前台的 secret 驗證', async () => {
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      type: 'access',
      side: 'front',
    });

    await service.resolve('token');

    expect(jwt.verify).toHaveBeenCalledWith('token', {
      secret: 'front-access-secret-min-32-characters',
    });
  });

  /**
   * 前台**不需要**「缺少 side 視為前台」的相容措施：
   * 前台 secret 是新的，用它簽出的 token 從第一天就一定帶 side。
   */
  it('⭐ 缺少 side → 拒絕（與後台的相容措施不同）', async () => {
    jwt.verify.mockReturnValue({ sub: 'user-1', type: 'access' });

    await expect(service.resolve('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('side 為 admin → 拒絕', async () => {
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      type: 'access',
      side: 'admin',
    });

    await expect(service.resolve('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refresh token 被當 access 用 → 拒絕', async () => {
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      type: 'refresh',
      side: 'front',
    });

    await expect(service.resolve('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // 黑名單在 JWT 驗證之前：已登出的 token 即使簽章仍有效也該擋下
  it('⭐ 黑名單檢查排在 JWT 驗證之前', async () => {
    blacklist.isBlacklisted.mockResolvedValue(true);

    await expect(service.resolve('token')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it('tokenVersion 不符 → 拒絕', async () => {
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      type: 'access',
      side: 'front',
      tokenVersion: 3,
    });

    await expect(service.resolve('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('帳號已停權 → AccountDisabledException', async () => {
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      type: 'access',
      side: 'front',
    });
    loadUser.loadById.mockResolvedValue(makeUser({ status: false }));

    await expect(service.resolve('token')).rejects.toThrow(
      AccountDisabledException,
    );
  });
});

describe('FrontRefreshTokenService', () => {
  let loadUser: jest.Mocked<LoadUserPort>;
  let jwt: jest.Mocked<JwtService>;
  let blacklist: jest.Mocked<TokenBlacklistPort>;
  let service: FrontRefreshTokenService;

  beforeEach(() => {
    jest.clearAllMocks();
    loadUser = makeLoadUser();
    jwt = makeJwt();
    blacklist = makeBlacklist();
    service = new FrontRefreshTokenService(jwt, loadUser, blacklist);
    loadUser.loadById.mockResolvedValue(makeUser());
  });

  it('換發成功，且舊的 refresh token 立刻進黑名單', async () => {
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      type: 'refresh',
      side: 'front',
      tokenVersion: 0,
      exp: Math.floor(Date.now() / 1000) + 1000,
    });

    await service.execute('old-refresh');

    expect(blacklist.addToBlacklist).toHaveBeenCalledWith(
      'old-refresh',
      expect.any(Number),
      'rotated',
    );
  });

  it('以 access token 呼叫 → 拒絕', async () => {
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      type: 'access',
      side: 'front',
    });

    await expect(service.execute('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('side 不是 front → 拒絕', async () => {
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      type: 'refresh',
      side: 'admin',
    });

    await expect(service.execute('token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('已在黑名單的 refresh token → 拒絕，且不進行驗證', async () => {
    blacklist.isBlacklisted.mockResolvedValue(true);

    await expect(service.execute('token')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it('帳號在這期間被停權 → 403', async () => {
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      type: 'refresh',
      side: 'front',
    });
    loadUser.loadById.mockResolvedValue(makeUser({ status: false }));

    await expect(service.execute('token')).rejects.toThrow(
      AccountDisabledException,
    );
  });
});
