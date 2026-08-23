import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  RESEND_VERIFICATION_USE_CASE,
  ResendVerificationUseCase,
} from '@app/application/port/in/front/auth/FrontRegistrationUseCases';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
import {
  EMAIL_SEND_RATE_LIMIT_PORT,
  EmailSendRateLimitPort,
} from '@app/application/port/out/shared/EmailSendRateLimitPort';
import { EmailSendRateLimitedException } from '@app/domain/exception/EmailSendRateLimitedException';
import { normalizeEmail } from '@app/shared/utils/normalize-email';
import { VerificationMailService } from './VerificationMailService';

export { RESEND_VERIFICATION_USE_CASE };

/**
 * 重發驗證信。
 *
 * **無論信箱是否存在、是否已驗證，都不拋錯也不回報結果。**
 * 這一支與註冊不同：註冊揭露信箱狀態是為了給使用者有用的回饋，
 * 而重發沒有那個需求——它若依帳號狀態回不同的東西，就是一個乾淨的帳號探測點。
 *
 * **限流在查帳號之前**，而且無論帳號存不存在都計數：
 * 只對「存在的帳號」計數的話，回應時間與 Redis 的計數狀態都會變成
 * 「這個信箱有沒有註冊」的旁通道。
 */
@Injectable()
export class ResendVerificationService implements ResendVerificationUseCase {
  private readonly logger = new Logger(ResendVerificationService.name);

  constructor(
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
    @Inject(EMAIL_SEND_RATE_LIMIT_PORT)
    private readonly rateLimit: EmailSendRateLimitPort,
    private readonly verificationMail: VerificationMailService,
  ) {}

  async execute(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);

    if (await this.rateLimit.hitAndCheck(email, 'VERIFY_EMAIL')) {
      throw new EmailSendRateLimitedException();
    }

    const user = await this.loadUser.loadByEmail(email);
    if (!user) {
      // 不記錄 email 本身，避免 log 累積「哪些信箱未註冊」的列舉資訊
      this.logger.debug('重發驗證信：查無此帳號，靜默略過');
      return;
    }
    if (user.emailVerifiedAt !== null) {
      this.logger.debug('重發驗證信：帳號已驗證，靜默略過');
      return;
    }

    await this.verificationMail.send(user.id, email);
  }
}
