import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  USER_TOKEN_PORT,
  UserTokenPort,
} from '@app/application/port/out/user/UserTokenPort';
import {
  SEND_EMAIL_PORT,
  SendEmailPort,
} from '@app/application/port/out/shared/SendEmailPort';
import { getEnv } from '@app/infrastructure/validate-env';

/**
 * 「發驗證 token + 寄信」的共用實作。
 *
 * 註冊與重發都要做這件事，而且**重發的規則必須完全一樣**（同樣作廢舊 token、
 * 同樣受信箱限流約束）。各寫一份的話兩邊會慢慢漂移，而漂移的那一邊
 * 不會有任何徵兆——信照樣寄得出去，只是規則不同。
 *
 * 這不是一個 use case，是被兩個 use case 共用的內部協作者，
 * 因此不註冊 in-port，直接以 class 注入。
 *
 * **這裡不做限流，由呼叫端負責。** 原因是重發那條路徑必須
 * 「無論帳號存不存在都先扣額度」——額度扣在查帳號**之前**，
 * 否則 Redis 的計數狀態就變成「這個信箱有沒有註冊」的旁通道。
 * 把限流藏在這裡的話，那個順序表達不出來，而且重發會被扣兩次。
 */
@Injectable()
export class VerificationMailService {
  private readonly logger = new Logger(VerificationMailService.name);

  constructor(
    @Inject(USER_TOKEN_PORT) private readonly userToken: UserTokenPort,
    @Inject(SEND_EMAIL_PORT) private readonly sendEmail: SendEmailPort,
  ) {}

  /**
   * 發一封驗證信。
   *
   * @param userId - 收信的前台使用者
   * @param email - **已正規化**的信箱
   */
  async send(userId: string, email: string): Promise<void> {
    const env = getEnv();
    const token = await this.userToken.issue(
      userId,
      'VERIFY_EMAIL',
      env.EMAIL_VERIFICATION_EXPIRES_IN,
    );
    const url = `${env.APP_FRONT_URL.replace(/\/$/, '')}/api/front/auth/verify-email?token=${token}`;
    const hours = Math.round(env.EMAIL_VERIFICATION_EXPIRES_IN / 3600);

    // **不 await**：SMTP 設定了卻連不上時會走滿 connectionTimeout（預設 10 秒），
    // 讓「帳號存在」的回應比「不存在」慢兩個數量級——那比狀態碼更明顯的列舉訊號。
    // 沿用後台 ForgotPasswordService 的 fire-and-forget 寫法
    void (async () => {
      try {
        await this.sendEmail.sendMail({
          to: email,
          subject: '請驗證你的信箱',
          html: `
          <p>您好，</p>
          <p>請點擊以下連結完成信箱驗證：</p>
          <p><a href="${url}">${url}</a></p>
          <p>此連結將在 ${hours} 小時後失效。</p>
          <p>如果您沒有註冊本服務，請忽略此信件。</p>
        `,
        });
      } catch (error) {
        // 不拋出：註冊本身已經成功了，讓它因為寄不出信而失敗只會讓使用者
        // 重試註冊然後撞上「信箱已存在」
        this.logger.error('驗證信寄送失敗', error);
      }
    })();
  }
}
