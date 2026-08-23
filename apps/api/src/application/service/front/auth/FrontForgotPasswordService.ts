import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FRONT_FORGOT_PASSWORD_USE_CASE,
  FrontForgotPasswordUseCase,
} from '@app/application/port/in/front/auth/FrontPasswordResetUseCases';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
import {
  USER_TOKEN_PORT,
  UserTokenPort,
} from '@app/application/port/out/user/UserTokenPort';
import {
  SEND_EMAIL_PORT,
  SendEmailPort,
} from '@app/application/port/out/shared/SendEmailPort';
import {
  EMAIL_SEND_RATE_LIMIT_PORT,
  EmailSendRateLimitPort,
} from '@app/application/port/out/shared/EmailSendRateLimitPort';
import { EmailSendRateLimitedException } from '@app/domain/exception/EmailSendRateLimitedException';
import { normalizeEmail } from '@app/shared/utils/normalize-email';
import { getEnv } from '@app/infrastructure/validate-env';

export { FRONT_FORGOT_PASSWORD_USE_CASE };

/**
 * 前台的忘記密碼。
 *
 * **未驗證的帳號也可以重設密碼**：忘記密碼與信箱驗證是兩件事，
 * 而重設信本身就會送到那個信箱——能收到就證明他擁有它。
 * 擋掉未驗證者只會讓「註冊完忘記密碼」變成一個死結。
 *
 * 與後台的 `ForgotPasswordService` 平行而非共用：對象是另一張表、
 * 另一組 token、另一個效期。共用一支再用參數分流，會讓
 * 「這次要重設哪一側」變成每個呼叫端都要記得傳對的東西。
 */
@Injectable()
export class FrontForgotPasswordService implements FrontForgotPasswordUseCase {
  private readonly logger = new Logger(FrontForgotPasswordService.name);

  constructor(
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
    @Inject(USER_TOKEN_PORT) private readonly userToken: UserTokenPort,
    @Inject(SEND_EMAIL_PORT) private readonly sendEmail: SendEmailPort,
    @Inject(EMAIL_SEND_RATE_LIMIT_PORT)
    private readonly rateLimit: EmailSendRateLimitPort,
  ) {}

  async execute(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);

    // 限流在查帳號之前，且無論帳號存不存在都扣——
    // 只對存在的帳號計數的話，Redis 的計數狀態就成了帳號探測的旁通道
    if (await this.rateLimit.hitAndCheck(email, 'RESET_PASSWORD')) {
      throw new EmailSendRateLimitedException();
    }

    const user = await this.loadUser.loadByEmail(email);
    if (!user) {
      // 不記錄 email 本身，避免 log 累積「哪些信箱未註冊」的列舉資訊
      this.logger.debug('前台忘記密碼：查無此帳號，靜默略過');
      return;
    }

    const env = getEnv();
    const token = await this.userToken.issue(
      user.id,
      'RESET_PASSWORD',
      env.FRONT_PASSWORD_RESET_EXPIRES_IN,
    );
    const url = `${env.APP_FRONT_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
    const minutes = Math.round(env.FRONT_PASSWORD_RESET_EXPIRES_IN / 60);

    // **不 await**：SMTP 連不上時會走滿 connectionTimeout，讓「帳號存在」的回應
    // 比「不存在」慢兩個數量級——那比狀態碼更明顯的列舉訊號
    void (async () => {
      try {
        await this.sendEmail.sendMail({
          to: email,
          subject: '密碼重設通知',
          html: `
          <p>您好，</p>
          <p>我們收到您的密碼重設請求。請點擊以下連結重設密碼：</p>
          <p><a href="${url}">${url}</a></p>
          <p>此連結將在 ${minutes} 分鐘後失效。</p>
          <p>如果您沒有提出此請求，請忽略此信件。</p>
        `,
        });
      } catch (error) {
        this.logger.error('前台密碼重設信件寄送失敗', error);
      }
    })();
  }
}
