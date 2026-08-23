export const FORCE_LOGOUT_FRONT_USER_USE_CASE =
  'FORCE_LOGOUT_FRONT_USER_USE_CASE';

export interface ForceLogoutFrontUserCommand {
  /** 被強制登出的前台使用者 */
  userId: string;
  /** 執行的管理員；由 MemberContext 帶入，不接受客戶端指定 */
  moderatorId: string;
}

/**
 * 讓某前台使用者所有裝置的 token 立即失效並斷開既有連線，**但不停用帳號**。
 *
 * **與停權是兩件不同的事，MUST NOT 用「停權再解除」代替：**
 *
 * | 動作 | 語意 | `status` | 能否重新登入 |
 * | --- | --- | --- | --- |
 * | 停權 | 這個人違規 | 變 false | 不能 |
 * | 強制登出 | 這個帳號可能被別人拿到了 | 不變 | 能 |
 *
 * 用停權代替會在稽核裡留下一筆**不實的違規紀錄**，而稽核的用途正是事後回答
 * 「這個人被怎麼對待過」。
 *
 * **刻意不冪等**：每次呼叫都遞增 `tokenVersion` 並寫一筆稽核。
 * 「再登出一次」是有意義的重複動作——第一次之後對方又登入了——
 * 做成冪等會讓第二次靜默無效。
 *
 * **對已停權的帳號同樣有效**：兩件事互相獨立，沒有理由讓其中一個擋住另一個。
 */
export interface ForceLogoutFrontUserUseCase {
  execute(command: ForceLogoutFrontUserCommand): Promise<void>;
}
