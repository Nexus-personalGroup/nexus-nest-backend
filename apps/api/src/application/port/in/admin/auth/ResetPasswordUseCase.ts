export interface ResetPasswordCommand {
  token: string;
  newPassword: string;
}

export const RESET_PASSWORD_USE_CASE = 'RESET_PASSWORD_USE_CASE';

export interface ResetPasswordUseCase {
  /**
   * 透過 token 重設密碼
   * @param command - 包含 token 和新密碼的指令
   */
  execute(command: ResetPasswordCommand): Promise<void>;
}
