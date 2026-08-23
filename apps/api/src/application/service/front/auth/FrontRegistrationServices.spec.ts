import { FrontRegisterService } from './FrontRegisterService';
import { VerifyEmailService } from './VerifyEmailService';
import { ResendVerificationService } from './ResendVerificationService';
import { VerificationMailService } from './VerificationMailService';
import { EmailAlreadyExistsException } from '@app/domain/exception/EmailAlreadyExistsException';
import { EmailSendRateLimitedException } from '@app/domain/exception/EmailSendRateLimitedException';
import type { LoadUserPort } from '@app/application/port/out/user/LoadUserPort';
import type { SaveUserPort } from '@app/application/port/out/user/SaveUserPort';
import type { UserTokenPort } from '@app/application/port/out/user/UserTokenPort';
import type { EmailSendRateLimitPort } from '@app/application/port/out/shared/EmailSendRateLimitPort';
import type { PasswordPolicyService } from '@app/application/service/shared/PasswordPolicyService';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    BCRYPT_ROUNDS: 4,
    EMAIL_VERIFICATION_EXPIRES_IN: 86400,
    APP_FRONT_URL: 'http://localhost:5174',
  }),
}));

const makeUser = (over: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'user1@test.com',
  password: '$2b$04$hashed',
  displayName: '小明',
  avatarUrl: null,
  emailVerifiedAt: null,
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
  }) as unknown as jest.Mocked<LoadUserPort>;

const makeSaveUser = () =>
  ({
    create: jest.fn().mockResolvedValue('new-user'),
    markEmailVerified: jest.fn().mockResolvedValue(true),
  }) as unknown as jest.Mocked<SaveUserPort>;

const makeUserToken = () =>
  ({
    issue: jest.fn().mockResolvedValue('plain-token'),
    consume: jest.fn(),
    peekOwner: jest.fn(),
  }) as unknown as jest.Mocked<UserTokenPort>;

const makeRateLimit = () =>
  ({
    hitAndCheck: jest.fn().mockResolvedValue(false),
  }) as unknown as jest.Mocked<EmailSendRateLimitPort>;

const makePolicy = () =>
  ({
    validateOrThrow: jest.fn(),
  }) as unknown as jest.Mocked<PasswordPolicyService>;

describe('FrontRegisterService', () => {
  let loadUser: jest.Mocked<LoadUserPort>;
  let saveUser: jest.Mocked<SaveUserPort>;
  let rateLimit: jest.Mocked<EmailSendRateLimitPort>;
  let policy: jest.Mocked<PasswordPolicyService>;
  let mail: { send: jest.Mock };
  let service: FrontRegisterService;

  const command = {
    email: 'user1@test.com',
    password: 'User1234!',
    displayName: '小明',
  };

  beforeEach(() => {
    loadUser = makeLoadUser();
    saveUser = makeSaveUser();
    rateLimit = makeRateLimit();
    policy = makePolicy();
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    loadUser.loadByEmail.mockResolvedValue(null);
    service = new FrontRegisterService(
      loadUser,
      saveUser,
      rateLimit,
      policy,
      mail as unknown as VerificationMailService,
    );
  });

  it('註冊成功建立未驗證的帳號並寄信', async () => {
    const result = await service.execute(command);

    expect(saveUser.create).toHaveBeenCalled();
    expect(mail.send).toHaveBeenCalledWith('new-user', 'user1@test.com');
    expect(result.emailVerified).toBe(false);
  });

  it('⭐ 回應不含任何 token', async () => {
    const result = await service.execute(command);

    expect(Object.keys(result)).not.toContain('accessToken');
    expect(Object.keys(result)).not.toContain('refreshToken');
  });

  /** 正規化沒做的話，查重會放行然後撞上 unique 約束 */
  it('⭐ 信箱正規化後才查重與儲存', async () => {
    await service.execute({ ...command, email: '  Foo@X.com ' });

    expect(loadUser.loadByEmail).toHaveBeenCalledWith('foo@x.com');
    expect(saveUser.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'foo@x.com' }),
    );
  });

  it('已註冊且已驗證 → 409 且不寄信', async () => {
    loadUser.loadByEmail.mockResolvedValue(
      makeUser({ emailVerifiedAt: new Date() }),
    );

    await expect(service.execute(command)).rejects.toThrow(
      EmailAlreadyExistsException,
    );
    expect(mail.send).not.toHaveBeenCalled();
  });

  /**
   * 最常見的真實情境：信進了垃圾信匣，於是使用者重新註冊一次。
   * 擋掉他等於逼他換信箱。
   */
  it('⭐ 已註冊但未驗證 → 409 但重發驗證信，且不覆蓋既有帳號', async () => {
    loadUser.loadByEmail.mockResolvedValue(makeUser({ emailVerifiedAt: null }));

    await expect(service.execute(command)).rejects.toThrow(
      EmailAlreadyExistsException,
    );
    expect(mail.send).toHaveBeenCalledWith('user-1', 'user1@test.com');
    expect(saveUser.create).not.toHaveBeenCalled();
  });

  /**
   * 限流在查帳號之前，且無論帳號存不存在都扣——
   * 只對存在的帳號計數的話，Redis 的計數狀態就變成
   * 「這個信箱有沒有註冊」的旁通道。
   */
  it('⭐ 限流在查帳號之前就扣額度', async () => {
    rateLimit.hitAndCheck.mockResolvedValue(true);

    await expect(service.execute(command)).rejects.toThrow(
      EmailSendRateLimitedException,
    );
    expect(loadUser.loadByEmail).not.toHaveBeenCalled();
  });

  /** 先查重的話，密碼不合格的請求仍然會透露「這個信箱存在」 */
  it('⭐ 密碼政策在查重之前驗', async () => {
    policy.validateOrThrow.mockImplementation(() => {
      throw new Error('policy');
    });

    await expect(service.execute(command)).rejects.toThrow('policy');
    expect(loadUser.loadByEmail).not.toHaveBeenCalled();
  });
});

describe('VerifyEmailService', () => {
  let userToken: jest.Mocked<UserTokenPort>;
  let loadUser: jest.Mocked<LoadUserPort>;
  let saveUser: jest.Mocked<SaveUserPort>;
  let service: VerifyEmailService;

  beforeEach(() => {
    userToken = makeUserToken();
    loadUser = makeLoadUser();
    saveUser = makeSaveUser();
    service = new VerifyEmailService(userToken, loadUser, saveUser);
  });

  it('有效 token → success 並標記已驗證', async () => {
    userToken.consume.mockResolvedValue('user-1');

    await expect(service.execute('t')).resolves.toBe('success');
    expect(saveUser.markEmailVerified).toHaveBeenCalledWith('user-1');
  });

  it('⭐ 消費時必須帶 purpose', async () => {
    userToken.consume.mockResolvedValue('user-1');

    await service.execute('t');

    expect(userToken.consume).toHaveBeenCalledWith('t', 'VERIFY_EMAIL');
  });

  /**
   * 信件的預抓與郵件安全掃描會在使用者點擊之前就把 token 用掉。
   * 這時回「連結已失效」，使用者看到的是一個他什麼都沒做錯的失敗——
   * 而且重發也沒用，新的那封同樣會被掃描器先消費掉。
   */
  it('⭐ token 已被消費但本人已驗證 → 仍回 success', async () => {
    userToken.consume.mockResolvedValue(null);
    userToken.peekOwner.mockResolvedValue('user-1');
    loadUser.loadById.mockResolvedValue(
      makeUser({ emailVerifiedAt: new Date() }),
    );

    await expect(service.execute('t')).resolves.toBe('success');
  });

  it('token 已被消費且本人未驗證 → expired', async () => {
    userToken.consume.mockResolvedValue(null);
    userToken.peekOwner.mockResolvedValue('user-1');
    loadUser.loadById.mockResolvedValue(makeUser({ emailVerifiedAt: null }));

    await expect(service.execute('t')).resolves.toBe('expired');
  });

  it('token 不存在或用途不符 → invalid', async () => {
    userToken.consume.mockResolvedValue(null);
    userToken.peekOwner.mockResolvedValue(null);

    await expect(service.execute('t')).resolves.toBe('invalid');
    expect(saveUser.markEmailVerified).not.toHaveBeenCalled();
  });
});

describe('ResendVerificationService', () => {
  let loadUser: jest.Mocked<LoadUserPort>;
  let rateLimit: jest.Mocked<EmailSendRateLimitPort>;
  let mail: { send: jest.Mock };
  let service: ResendVerificationService;

  beforeEach(() => {
    loadUser = makeLoadUser();
    rateLimit = makeRateLimit();
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    service = new ResendVerificationService(
      loadUser,
      rateLimit,
      mail as unknown as VerificationMailService,
    );
  });

  it('未驗證的帳號 → 寄信', async () => {
    loadUser.loadByEmail.mockResolvedValue(makeUser({ emailVerifiedAt: null }));

    await service.execute('user1@test.com');

    expect(mail.send).toHaveBeenCalledWith('user-1', 'user1@test.com');
  });

  /** 依帳號狀態回不同的東西，就是一個乾淨的帳號探測點 */
  it('⭐ 信箱不存在 → 不拋錯、不寄信', async () => {
    loadUser.loadByEmail.mockResolvedValue(null);

    await expect(service.execute('ghost@test.com')).resolves.toBeUndefined();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('已驗證的帳號 → 不拋錯、不寄信', async () => {
    loadUser.loadByEmail.mockResolvedValue(
      makeUser({ emailVerifiedAt: new Date() }),
    );

    await expect(service.execute('user1@test.com')).resolves.toBeUndefined();
    expect(mail.send).not.toHaveBeenCalled();
  });

  /**
   * 只對存在的帳號計數的話，Redis 的計數狀態就變成
   * 「這個信箱有沒有註冊」的旁通道。
   */
  it('⭐ 帳號不存在時額度照樣扣', async () => {
    loadUser.loadByEmail.mockResolvedValue(null);

    await service.execute('ghost@test.com');

    expect(rateLimit.hitAndCheck).toHaveBeenCalledWith(
      'ghost@test.com',
      'VERIFY_EMAIL',
    );
  });

  it('⭐ 限流在查帳號之前', async () => {
    rateLimit.hitAndCheck.mockResolvedValue(true);

    await expect(service.execute('user1@test.com')).rejects.toThrow(
      EmailSendRateLimitedException,
    );
    expect(loadUser.loadByEmail).not.toHaveBeenCalled();
  });

  it('大小寫不同的同一信箱共用額度', async () => {
    loadUser.loadByEmail.mockResolvedValue(null);

    await service.execute('  Foo@X.com ');

    expect(rateLimit.hitAndCheck).toHaveBeenCalledWith(
      'foo@x.com',
      'VERIFY_EMAIL',
    );
  });
});
