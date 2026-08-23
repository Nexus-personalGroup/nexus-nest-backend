import { FrontForgotPasswordService } from './FrontForgotPasswordService';
import { FrontResetPasswordService } from './FrontResetPasswordService';
import { EmailSendRateLimitedException } from '@app/domain/exception/EmailSendRateLimitedException';
import { InvalidTokenException } from '@app/domain/exception/InvalidTokenException';
import type { LoadUserPort } from '@app/application/port/out/user/LoadUserPort';
import type { SaveUserPort } from '@app/application/port/out/user/SaveUserPort';
import type { UserTokenPort } from '@app/application/port/out/user/UserTokenPort';
import type { SendEmailPort } from '@app/application/port/out/shared/SendEmailPort';
import type { EmailSendRateLimitPort } from '@app/application/port/out/shared/EmailSendRateLimitPort';
import type { PasswordPolicyService } from '@app/application/service/shared/PasswordPolicyService';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    BCRYPT_ROUNDS: 4,
    FRONT_PASSWORD_RESET_EXPIRES_IN: 3600,
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

describe('FrontForgotPasswordService', () => {
  let loadUser: jest.Mocked<LoadUserPort>;
  let userToken: jest.Mocked<UserTokenPort>;
  let sendEmail: jest.Mocked<SendEmailPort>;
  let rateLimit: jest.Mocked<EmailSendRateLimitPort>;
  let service: FrontForgotPasswordService;

  beforeEach(() => {
    loadUser = {
      loadByEmail: jest.fn(),
    } as unknown as jest.Mocked<LoadUserPort>;
    userToken = {
      issue: jest.fn().mockResolvedValue('plain'),
    } as unknown as jest.Mocked<UserTokenPort>;
    sendEmail = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    };
    rateLimit = {
      hitAndCheck: jest.fn().mockResolvedValue(false),
    };
    service = new FrontForgotPasswordService(
      loadUser,
      userToken,
      sendEmail,
      rateLimit,
    );
  });

  it('帳號存在 → 發 RESET_PASSWORD token', async () => {
    loadUser.loadByEmail.mockResolvedValue(makeUser());

    await service.execute('user1@test.com');

    expect(userToken.issue).toHaveBeenCalledWith(
      'user-1',
      'RESET_PASSWORD',
      3600,
    );
  });

  /** 依帳號狀態回不同的東西，就是一個乾淨的帳號探測點 */
  it('⭐ 帳號不存在 → 不拋錯、不發 token', async () => {
    loadUser.loadByEmail.mockResolvedValue(null);

    await expect(service.execute('ghost@test.com')).resolves.toBeUndefined();
    expect(userToken.issue).not.toHaveBeenCalled();
  });

  /**
   * 忘記密碼與信箱驗證是兩件事，而重設信本身就會送到那個信箱——
   * 能收到就證明他擁有它。擋掉未驗證者會讓「註冊完忘記密碼」變成死結。
   */
  it('⭐ 未驗證的帳號也照常發信', async () => {
    loadUser.loadByEmail.mockResolvedValue(makeUser({ emailVerifiedAt: null }));

    await service.execute('user1@test.com');

    expect(userToken.issue).toHaveBeenCalled();
  });

  it('⭐ 帳號不存在時額度照樣扣', async () => {
    loadUser.loadByEmail.mockResolvedValue(null);

    await service.execute('ghost@test.com');

    expect(rateLimit.hitAndCheck).toHaveBeenCalledWith(
      'ghost@test.com',
      'RESET_PASSWORD',
    );
  });

  it('⭐ 限流在查帳號之前', async () => {
    rateLimit.hitAndCheck.mockResolvedValue(true);

    await expect(service.execute('user1@test.com')).rejects.toThrow(
      EmailSendRateLimitedException,
    );
    expect(loadUser.loadByEmail).not.toHaveBeenCalled();
  });
});

describe('FrontResetPasswordService', () => {
  let userToken: jest.Mocked<UserTokenPort>;
  let saveUser: jest.Mocked<SaveUserPort>;
  let policy: jest.Mocked<PasswordPolicyService>;
  let service: FrontResetPasswordService;

  const command = { token: 'plain', password: 'NewPass1234!' };

  beforeEach(() => {
    userToken = {
      consume: jest.fn().mockResolvedValue('user-1'),
    } as unknown as jest.Mocked<UserTokenPort>;
    saveUser = {
      updatePassword: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<SaveUserPort>;
    policy = {
      validateOrThrow: jest.fn(),
    } as unknown as jest.Mocked<PasswordPolicyService>;
    service = new FrontResetPasswordService(userToken, saveUser, policy);
  });

  it('有效 token → 寫入新密碼', async () => {
    await service.execute(command);

    expect(saveUser.updatePassword).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('$2b$'),
    );
  });

  /** 少了 purpose 就能拿驗證信的 token 來改密碼 */
  it('⭐ 消費時必須帶 RESET_PASSWORD', async () => {
    await service.execute(command);

    expect(userToken.consume).toHaveBeenCalledWith('plain', 'RESET_PASSWORD');
  });

  it('token 無效 → InvalidTokenException，且不寫密碼', async () => {
    userToken.consume.mockResolvedValue(null);

    await expect(service.execute(command)).rejects.toThrow(
      InvalidTokenException,
    );
    expect(saveUser.updatePassword).not.toHaveBeenCalled();
  });

  /**
   * 反過來的話密碼不合格時 token 已經被消費掉，
   * 使用者得回去重新申請一次。
   */
  it('⭐ 密碼政策在消費 token 之前驗', async () => {
    policy.validateOrThrow.mockImplementation(() => {
      throw new Error('policy');
    });

    await expect(service.execute(command)).rejects.toThrow('policy');
    expect(userToken.consume).not.toHaveBeenCalled();
  });
});
