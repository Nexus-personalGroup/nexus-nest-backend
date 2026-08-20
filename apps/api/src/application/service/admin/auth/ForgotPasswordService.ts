import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ForgotPasswordCommand,
  ForgotPasswordUseCase,
} from '../../../port/in/admin/auth/ForgotPasswordUseCase';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../../port/out/member/LoadMemberPort';
import {
  PASSWORD_RESET_TOKEN_PORT,
  PasswordResetTokenPort,
} from '../../../port/out/auth/PasswordResetTokenPort';
import {
  SEND_EMAIL_PORT,
  SendEmailPort,
} from '../../../port/out/shared/SendEmailPort';
import { getEnv } from '@app/infrastructure/validate-env';

/**
 * 忘記密碼服務：產生重設 token 並寄送信件。
 * 為避免資訊洩漏，即使 email 不存在也不回傳錯誤。
 */
@Injectable()
export class ForgotPasswordService implements ForgotPasswordUseCase {
  private readonly logger = new Logger(ForgotPasswordService.name);

  constructor(
    @Inject(LOAD_MEMBER_PORT)
    private readonly loadMember: LoadMemberPort,
    @Inject(PASSWORD_RESET_TOKEN_PORT)
    private readonly resetToken: PasswordResetTokenPort,
    @Inject(SEND_EMAIL_PORT)
    private readonly sendEmail: SendEmailPort,
  ) {}

  async execute(command: ForgotPasswordCommand): Promise<void> {
    const member = await this.loadMember.loadMemberByEmail(command.email);

    // 即使帳號不存在也不回報，防止帳號列舉攻擊
    if (!member) {
      // 不記錄 email 本身，避免 log 累積「哪些信箱未註冊」的列舉資訊
      this.logger.debug('忘記密碼：查無此帳號，靜默略過');
      return;
    }

    const env = getEnv();
    const token = await this.resetToken.createToken(
      member.id.toString(),
      env.APP_PASSWORD_RESET_TOKEN_EXPIRES_IN,
    );

    const resetUrl = env.APP_PASSWORD_RESET_URL
      ? `${env.APP_PASSWORD_RESET_URL}?token=${token}`
      : `#token=${token}`;

    // **不 await**：SMTP 設定了卻連不上時會走滿 connectionTimeout（預設 10 秒），
    // 讓「帳號存在」的回應比「不存在」慢兩個數量級——那比狀態碼更明顯的列舉訊號。
    // 回應內容與狀態碼的一致性已經處理好了，時間差是最後一處缺口。
    // 沿用 LoginService.updateLastLoginAt 的 fire-and-forget 寫法。
    void (async () => {
      try {
        await this.sendEmail.sendMail({
          to: command.email,
          subject: '密碼重設通知',
          html: `
          <p>您好，</p>
          <p>我們收到您的密碼重設請求。請點擊以下連結重設密碼：</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>此連結將在 ${env.APP_PASSWORD_RESET_TOKEN_EXPIRES_IN} 分鐘後失效。</p>
          <p>如果您沒有提出此請求，請忽略此信件。</p>
        `,
        });
      } catch (err) {
        // 不拋出錯誤，避免暴露使用者是否存在
        this.logger.error('密碼重設信件寄送失敗', err);
      }
    })();
  }
}
