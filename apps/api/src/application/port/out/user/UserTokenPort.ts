export const USER_TOKEN_PORT = 'USER_TOKEN_PORT';

/**
 * 一次性 token 的用途。
 *
 * 兩種用途共用一張表，因此**每一次查詢都必須帶它**——
 * 少了這個條件就能拿驗證信的 token 去改密碼。
 */
export type UserTokenPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

export interface UserTokenPort {
  /**
   * 發一個新 token，並**作廢該使用者同用途的其他未使用 token**。
   *
   * 回傳**明文**（要寄給使用者），資料庫只留 sha256 雜湊。
   * 作廢舊的是為了讓「最後一封信」是唯一有效的那一封——
   * 否則使用者重發三次之後有三個同時有效的 token，而他只會用最新那個。
   *
   * @param userId - 前台使用者 ID
   * @param purpose - 用途
   * @param ttlSeconds - 效期
   * @returns 明文 token
   */
  issue(
    userId: string,
    purpose: UserTokenPurpose,
    ttlSeconds: number,
  ): Promise<string>;

  /**
   * 消費一個 token：驗證、標記已使用、作廢同使用者同用途的其他 token。
   *
   * **`purpose` 是必要參數，不是選項。** 無效、過期、已使用、用途不符
   * 一律回 `null`——呼叫端因此不可能把四者區分開來回報，
   * 而那正是「不洩漏帳號狀態」要的效果。
   *
   * @returns 該 token 的擁有者 ID；任何一種失敗都回 null
   */
  consume(token: string, purpose: UserTokenPurpose): Promise<string | null>;

  /**
   * 查一個 token 的擁有者，**不消費它**。
   *
   * 只給「驗證成功要冪等」那個情境用：token 已被預抓消費掉時，
   * 仍要能查出它屬於誰，才判斷得出「這個人其實已經驗證過了」。
   */
  peekOwner(token: string, purpose: UserTokenPurpose): Promise<string | null>;
}
