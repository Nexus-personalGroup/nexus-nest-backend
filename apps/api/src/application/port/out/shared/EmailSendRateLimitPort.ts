export const EMAIL_SEND_RATE_LIMIT_PORT = 'EMAIL_SEND_RATE_LIMIT_PORT';

/** 受限流保護的寄信用途。不同用途各自計數，互不影響 */
export type EmailSendPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

/**
 * 「對同一個信箱寄信」的限流。
 *
 * **與 HTTP 的 IP 限流是兩層，缺一不可**，因為它們擋的是不同的形狀：
 *
 * - IP 限流擋「同一個來源大量註冊」——但擋不住分散式來源。
 * - 信箱限流擋「對同一個信箱反覆發信」——那是**拿這個服務當垃圾信跳板**的形狀，
 *   而它只需要一個 IP。
 *
 * 只做 IP 的話，攻擊者拿到一個受害者的信箱位址，就能用你的 SMTP 對他轟炸；
 * 只做信箱的話，一個 IP 可以對一萬個不同信箱各發一封。
 */
export interface EmailSendRateLimitPort {
  /**
   * 記錄一次寄送並回報是否超過閾值。
   *
   * **必須是「記錄並判斷」而非「只判斷」**：分成兩次呼叫會有競態，
   * 同一瞬間的多個請求可能全部讀到超標前的計數而一起放行。
   *
   * 呼叫端傳入的 email MUST 已正規化（小寫、去空白），
   * 否則 `Foo@x.com` 與 `foo@x.com` 會拿到兩份獨立的額度。
   *
   * @returns true 代表已超過閾值，本次寄送應被拒絕
   */
  hitAndCheck(email: string, purpose: EmailSendPurpose): Promise<boolean>;
}
