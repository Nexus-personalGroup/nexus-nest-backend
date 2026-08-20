export interface ForgotPasswordCommand {
  email: string;
}

export const FORGOT_PASSWORD_USE_CASE = 'FORGOT_PASSWORD_USE_CASE';

export interface ForgotPasswordUseCase {
  /**
   * 處理忘記密碼請求：產生 token 並寄送重設密碼信件
   * @param command - 包含 email 的指令
   */
  execute(command: ForgotPasswordCommand): Promise<void>;
}
