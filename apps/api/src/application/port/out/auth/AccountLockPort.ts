export const ACCOUNT_LOCK_PORT = 'ACCOUNT_LOCK_PORT';

/**
 * 帳號鎖定的三種狀態。
 *
 * **刻意不用布林。** 布林分不出「從未鎖定」與「鎖過但已到期」，
 * 而後者必須**一併清除失敗計數**——計數存在 Redis 且 TTL（30 分鐘）比鎖定時效長，
 * 不清的話使用者在到期後第一次打錯就會因為「計數還在閾值上」立刻重新被鎖，
 * 實際鎖定時間變成計數的 TTL 而非設定的時效，而設定的那個數字看起來完全正常。
 *
 * 用三態讓呼叫端**必須**面對 EXPIRED 這個情況，而不是靠記得。
 */
export type AccountLockStatus = 'NONE' | 'LOCKED' | 'EXPIRED';

export interface AccountLockPort {
  /**
   * 記錄一次登入失敗，回傳目前累計失敗次數
   * @param email - 帳號 email
   * @returns 累計失敗次數
   */
  recordFailedLogin(email: string): Promise<number>;

  /**
   * 重置失敗計數（登入成功時呼叫）
   * @param email - 帳號 email
   */
  resetFailedLogin(email: string): Promise<void>;

  /**
   * 查詢帳號的鎖定狀態。
   *
   * **本方法不得有副作用。** 到期時該做的清理由呼叫端負責——
   * 一個查詢方法偷偷做寫入，是下一個人絕對不會預期的事。
   * @param email - 帳號 email
   * @returns 鎖定狀態；EXPIRED 代表呼叫端必須清除失敗計數
   */
  checkLock(email: string): Promise<AccountLockStatus>;

  /**
   * 鎖定帳號
   * @param email - 帳號 email
   */
  lockAccount(email: string): Promise<void>;

  /**
   * 解鎖帳號（重置鎖定狀態與失敗計數）
   * @param email - 帳號 email
   */
  unlockAccount(email: string): Promise<void>;
}
