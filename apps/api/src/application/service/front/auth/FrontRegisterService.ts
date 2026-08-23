import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  FRONT_REGISTER_USE_CASE,
  FrontRegisterCommand,
  FrontRegisterUseCase,
} from '@app/application/port/in/front/auth/FrontRegistrationUseCases';
import type { FrontUserSummary } from '@app/application/port/in/front/auth/FrontAuthUseCases';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
import {
  SAVE_USER_PORT,
  SaveUserPort,
} from '@app/application/port/out/user/SaveUserPort';
import {
  EMAIL_SEND_RATE_LIMIT_PORT,
  EmailSendRateLimitPort,
} from '@app/application/port/out/shared/EmailSendRateLimitPort';
import { EmailSendRateLimitedException } from '@app/domain/exception/EmailSendRateLimitedException';
import { PasswordPolicyService } from '@app/application/service/shared/PasswordPolicyService';
import { EmailAlreadyExistsException } from '@app/domain/exception/EmailAlreadyExistsException';
import { normalizeEmail } from '@app/shared/utils/normalize-email';
import { getEnv } from '@app/infrastructure/validate-env';
import { VerificationMailService } from './VerificationMailService';

export { FRONT_REGISTER_USE_CASE };

/**
 * 前台註冊。
 *
 * **本 service 刻意會揭露「這個信箱是否已註冊」**，與其他四支「一律成功」的
 * 端點不同——理由見 in-port 的說明。
 */
@Injectable()
export class FrontRegisterService implements FrontRegisterUseCase {
  constructor(
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
    @Inject(SAVE_USER_PORT) private readonly saveUser: SaveUserPort,
    @Inject(EMAIL_SEND_RATE_LIMIT_PORT)
    private readonly rateLimit: EmailSendRateLimitPort,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly verificationMail: VerificationMailService,
  ) {}

  /**
   * 建立一個信箱尚未驗證的前台使用者並寄出驗證信
   *
   * @param command - 註冊資料
   * @throws EmailAlreadyExistsException 該信箱已註冊（未驗證者會順便重發驗證信）
   * @throws EmailSendRateLimitedException 該信箱在視窗內已達寄送上限
   */
  async execute(command: FrontRegisterCommand): Promise<FrontUserSummary> {
    const email = normalizeEmail(command.email);

    // 限流在最前面，且**無論這個信箱存不存在都扣**：只對存在的帳號計數的話，
    // Redis 的計數狀態就變成「這個信箱有沒有註冊」的旁通道
    if (await this.rateLimit.hitAndCheck(email, 'VERIFY_EMAIL')) {
      throw new EmailSendRateLimitedException();
    }

    // 密碼政策在查重之前驗：先查重的話，一個密碼不合格的請求
    // 仍然會告訴呼叫者「這個信箱存在」，等於多送一次列舉資訊
    this.passwordPolicy.validateOrThrow(command.password);

    const existing = await this.loadUser.loadByEmail(email);
    if (existing) {
      // 已註冊但還沒驗證：順便重發一次。這是最常見的真實情境——
      // 信進了垃圾信匣，於是使用者重新註冊一次。擋掉他等於逼他換信箱。
      // **不覆蓋既有帳號的任何欄位**（尤其是密碼）
      if (existing.emailVerifiedAt === null) {
        await this.verificationMail.send(existing.id, email);
      }
      throw new EmailAlreadyExistsException();
    }

    const passwordHash = await bcrypt.hash(
      command.password,
      getEnv().BCRYPT_ROUNDS,
    );
    const userId = await this.saveUser.create({
      email,
      passwordHash,
      displayName: command.displayName,
    });

    await this.verificationMail.send(userId, email);

    // 不回 token：註冊不等於登入，使用者要自己走登入流程
    return {
      id: userId,
      email,
      displayName: command.displayName,
      avatarUrl: null,
      emailVerified: false,
    };
  }
}
