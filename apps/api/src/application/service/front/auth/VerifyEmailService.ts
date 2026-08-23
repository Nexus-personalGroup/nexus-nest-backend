import { Inject, Injectable } from '@nestjs/common';
import {
  VERIFY_EMAIL_USE_CASE,
  VerifyEmailResult,
  VerifyEmailUseCase,
} from '@app/application/port/in/front/auth/FrontRegistrationUseCases';
import {
  USER_TOKEN_PORT,
  UserTokenPort,
} from '@app/application/port/out/user/UserTokenPort';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
import {
  SAVE_USER_PORT,
  SaveUserPort,
} from '@app/application/port/out/user/SaveUserPort';

export { VERIFY_EMAIL_USE_CASE };

/**
 * 信箱驗證。
 *
 * **成功是冪等的**，而那不是一個細節：信件的預抓（prefetch）與郵件安全掃描
 * 會在使用者點擊之前就把 token 用掉。這時如果回「連結已失效」，
 * 使用者看到的是一個他什麼都沒做錯的失敗——而且他重發也沒用，
 * 因為新的那封同樣會被掃描器先消費掉。
 *
 * 因此消費失敗時要再問一次「這個 token 本來屬於誰、那個人是不是已經驗證了」，
 * 是的話一律回 success。
 */
@Injectable()
export class VerifyEmailService implements VerifyEmailUseCase {
  constructor(
    @Inject(USER_TOKEN_PORT) private readonly userToken: UserTokenPort,
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
    @Inject(SAVE_USER_PORT) private readonly saveUser: SaveUserPort,
  ) {}

  async execute(token: string): Promise<VerifyEmailResult> {
    const userId = await this.userToken.consume(token, 'VERIFY_EMAIL');

    if (userId === null) {
      return this.resolveAlreadyVerified(token);
    }

    await this.saveUser.markEmailVerified(userId);
    return 'success';
  }

  /**
   * 消費失敗時的第二次判斷。
   *
   * `peekOwner` 刻意不看 usedAt 與 expiresAt——它要回答的正是
   * 「這個已經被用掉／過期的 token 本來屬於誰」。
   *
   * 回 `expired` 而非 `invalid` 的條件很窄：token 確實存在、用途也對，
   * 只是那個人還沒驗證。其餘一律 `invalid`，讓「不存在」與「用途不符」
   * 對呼叫者不可區分。
   */
  private async resolveAlreadyVerified(
    token: string,
  ): Promise<VerifyEmailResult> {
    const owner = await this.userToken.peekOwner(token, 'VERIFY_EMAIL');
    if (owner === null) return 'invalid';

    const user = await this.loadUser.loadById(owner);
    if (user === null) return 'invalid';

    // 已經驗證過了 → 對使用者而言這次點擊是成功的
    return user.emailVerifiedAt !== null ? 'success' : 'expired';
  }
}
