export const FRONT_FORGOT_PASSWORD_USE_CASE = 'FRONT_FORGOT_PASSWORD_USE_CASE';
export const FRONT_RESET_PASSWORD_USE_CASE = 'FRONT_RESET_PASSWORD_USE_CASE';

export interface FrontResetPasswordCommand {
  token: string;
  password: string;
}

/**
 * 前台的忘記密碼。
 *
 * **無論信箱是否存在都不拋錯、不回報結果**——判準與重發驗證信相同。
 * 這一支沒有「給使用者有用的回饋」這個需求可以拿來抵消帳號列舉的風險：
 * 使用者本來就只會看到「信寄出去了，請去收信」。
 */
export interface FrontForgotPasswordUseCase {
  execute(email: string): Promise<void>;
}

/**
 * 前台的重設密碼。
 *
 * **無效、過期、已使用、用途不符一律拋同一個例外**，呼叫端因此不可能把
 * 四者區分開來回報——那正是「不洩漏 token 是否曾經存在」要的效果。
 */
export interface FrontResetPasswordUseCase {
  execute(command: FrontResetPasswordCommand): Promise<void>;
}
