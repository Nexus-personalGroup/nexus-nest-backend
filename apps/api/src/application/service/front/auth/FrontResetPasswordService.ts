import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  FRONT_RESET_PASSWORD_USE_CASE,
  FrontResetPasswordCommand,
  FrontResetPasswordUseCase,
} from '@app/application/port/in/front/auth/FrontPasswordResetUseCases';
import {
  USER_TOKEN_PORT,
  UserTokenPort,
} from '@app/application/port/out/user/UserTokenPort';
import {
  SAVE_USER_PORT,
  SaveUserPort,
} from '@app/application/port/out/user/SaveUserPort';
import { PasswordPolicyService } from '@app/application/service/shared/PasswordPolicyService';
import { InvalidTokenException } from '@app/domain/exception/InvalidTokenException';
import { getEnv } from '@app/infrastructure/validate-env';

export { FRONT_RESET_PASSWORD_USE_CASE };

/**
 * 前台的重設密碼。
 *
 * `SaveUserPort.updatePassword` 會**同時遞增 `tokenVersion`**，讓所有裝置立即登出。
 * 那不是附加功能：會走到「忘記密碼」的情境本來就包含「帳號可能正被別人用著」，
 * 改完密碼卻讓對方的既有 session 繼續有效，等於重設了一半。
 */
@Injectable()
export class FrontResetPasswordService implements FrontResetPasswordUseCase {
  constructor(
    @Inject(USER_TOKEN_PORT) private readonly userToken: UserTokenPort,
    @Inject(SAVE_USER_PORT) private readonly saveUser: SaveUserPort,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  /**
   * 以一次性 token 設定新密碼
   *
   * @throws InvalidTokenException token 無效、過期、已使用或用途不符（四者不可區分）
   */
  async execute(command: FrontResetPasswordCommand): Promise<void> {
    // 密碼政策先驗：消費 token 之後才發現密碼不合格的話，
    // 使用者手上那個 token 已經沒了，得回去重新申請一次
    this.passwordPolicy.validateOrThrow(command.password);

    // 帶 purpose：少了它就能拿驗證信的 token 來改密碼
    const userId = await this.userToken.consume(
      command.token,
      'RESET_PASSWORD',
    );
    if (userId === null) throw new InvalidTokenException();

    const passwordHash = await bcrypt.hash(
      command.password,
      getEnv().BCRYPT_ROUNDS,
    );
    await this.saveUser.updatePassword(userId, passwordHash);
  }
}
