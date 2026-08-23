/**
 * 信箱正規化：去頭尾空白 + 轉小寫。
 *
 * **查重、儲存與限流的計數鍵一律用正規化後的值。** 少了它，
 * `Foo@x.com` 與 `foo@x.com` 會被當成兩個信箱——查重放行然後撞上 unique 約束，
 * 而限流會各給一份額度，形同虛設。
 *
 * 只做這兩件事，**不做 Gmail 的 dot / plus 正規化**：那會讓
 * `a.b@gmail.com` 與 `ab@gmail.com` 變成同一個帳號，而那是 Gmail 的規則
 * 不是信箱的規則，套在其他網域上是錯的。
 */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
