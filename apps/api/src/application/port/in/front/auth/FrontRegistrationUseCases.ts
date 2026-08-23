import type { FrontUserSummary } from './FrontAuthUseCases';

export const FRONT_REGISTER_USE_CASE = 'FRONT_REGISTER_USE_CASE';
export const VERIFY_EMAIL_USE_CASE = 'VERIFY_EMAIL_USE_CASE';
export const RESEND_VERIFICATION_USE_CASE = 'RESEND_VERIFICATION_USE_CASE';

export interface FrontRegisterCommand {
  email: string;
  password: string;
  displayName: string;
}

/**
 * 前台註冊。
 *
 * **本 use case 刻意會揭露「這個信箱是否已註冊」（拋 `EmailAlreadyExistsException`）**，
 * 與其他四支「一律成功」的端點不同。不這樣做的話使用者收不到任何有用的回饋——
 * 他會以為註冊成功然後永遠等不到信。而「這個信箱能不能註冊」本來就是註冊表單
 * 必須回答的問題，藏不住。要擋的是**把它自動化**，那是限流的工作。
 */
export interface FrontRegisterUseCase {
  execute(command: FrontRegisterCommand): Promise<FrontUserSummary>;
}

/**
 * 信箱驗證的結果。
 *
 * 回列舉而非布林：呼叫端要把它翻成導向的 `?result=`，
 * 而「無效」與「過期」對使用者是不同的下一步（重新申請 vs 再點一次新的信）。
 */
export type VerifyEmailResult = 'success' | 'invalid' | 'expired';

export interface VerifyEmailUseCase {
  /**
   * 驗證一個 `VERIFY_EMAIL` token。
   *
   * **成功必須是冪等的**：已驗證的帳號再次帶同一個 token 進來仍回 `success`。
   * 信件的預抓與安全掃描會提前把 token 用掉，這時對使用者顯示失敗是錯的。
   */
  execute(token: string): Promise<VerifyEmailResult>;
}

/**
 * 重發驗證信。
 *
 * **無論信箱是否存在、是否已驗證，都不拋錯也不回報結果。**
 * 這一支與註冊不同：註冊揭露信箱狀態是為了給使用者有用的回饋，
 * 而重發沒有那個需求——它若依帳號狀態回不同的東西，就是一個乾淨的帳號探測點。
 */
export interface ResendVerificationUseCase {
  execute(email: string): Promise<void>;
}
