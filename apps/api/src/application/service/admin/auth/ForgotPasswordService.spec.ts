import { ForgotPasswordService } from './ForgotPasswordService';
import { LoadMemberPort } from '../../../port/out/member/LoadMemberPort';
import { PasswordResetTokenPort } from '../../../port/out/auth/PasswordResetTokenPort';
import { SendEmailPort } from '../../../port/out/shared/SendEmailPort';

jest.mock('../../../../infrastructure/validate-env', () => ({
  getEnv: () => ({
    APP_PASSWORD_RESET_TOKEN_EXPIRES_IN: 30,
    APP_PASSWORD_RESET_URL: 'https://app.test/reset',
  }),
}));

const mockLoadMember = {
  loadMemberByEmail: jest.fn(),
  loadMemberById: jest.fn(),
} as unknown as jest.Mocked<LoadMemberPort>;

const mockResetToken = {
  createToken: jest.fn(),
  claim: jest.fn(),
} as unknown as jest.Mocked<PasswordResetTokenPort>;

const mockSendEmail = {
  sendMail: jest.fn(),
} as unknown as jest.Mocked<SendEmailPort>;

const makeService = () =>
  new ForgotPasswordService(mockLoadMember, mockResetToken, mockSendEmail);

const memberStub = { id: { toString: () => 'member-1' } };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ForgotPasswordService', () => {
  it('email 不存在 → 靜默略過，不建 token、不寄信', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(null);

    await makeService().execute({ email: 'nobody@test.com' });

    expect(mockResetToken.createToken).not.toHaveBeenCalled();
    expect(mockSendEmail.sendMail).not.toHaveBeenCalled();
  });

  it('email 存在 → 以 memberId + 期限建 token，並寄送至該 email', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      memberStub,
    );
    mockResetToken.createToken.mockResolvedValue('reset-token-abc');

    await makeService().execute({ email: 'user@test.com' });

    expect(mockResetToken.createToken).toHaveBeenCalledWith('member-1', 30);
    expect(mockSendEmail.sendMail).toHaveBeenCalledTimes(1);
    const arg = mockSendEmail.sendMail.mock.calls[0][0];
    expect(arg.to).toBe('user@test.com');
    expect(arg.html).toContain('reset-token-abc');
  });

  it('寄信失敗 → 不拋例外（避免帳號列舉）', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      memberStub,
    );
    mockResetToken.createToken.mockResolvedValue('tok');
    mockSendEmail.sendMail.mockRejectedValue(new Error('SMTP down'));

    await expect(
      makeService().execute({ email: 'user@test.com' }),
    ).resolves.toBeUndefined();
  });

  // SMTP 設定了卻連不上時會走滿 connectionTimeout（預設 10 秒）。若 execute 等它，
  // 「帳號存在」的回應會比「不存在」慢兩個數量級，成為比狀態碼更明顯的列舉訊號。
  it('不等待寄信完成——SMTP 卡住時 execute 仍立即返回', async () => {
    (mockLoadMember.loadMemberByEmail as jest.Mock).mockResolvedValue(
      memberStub,
    );
    mockResetToken.createToken.mockResolvedValue('tok');

    let release!: () => void;
    mockSendEmail.sendMail.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    const started = Date.now();
    await makeService().execute({ email: 'user@test.com' });
    const elapsed = Date.now() - started;

    expect(mockSendEmail.sendMail).toHaveBeenCalled();
    expect(elapsed).toBeLessThan(100);
    release();
  });
});
