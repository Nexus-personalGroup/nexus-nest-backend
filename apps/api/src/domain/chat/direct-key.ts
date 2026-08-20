/**
 * 產生 1:1 私聊房間的正規化鍵。
 *
 * 兩個成員 ID 排序後以冒號串接，讓 (A,B) 與 (B,A) 得到同一個值——
 * 唯一性靠 DB 的 unique index 保證，而 index 只認「值相同」，
 * 因此正規化必須發生在寫入之前，而且**只能有一處**。
 * 兩處各自實作、其中一處忘了排序，症狀是同一組人偶爾多出一個房間，難以察覺。
 *
 * @param a - 其中一名成員的 ID
 * @param b - 另一名成員的 ID
 * @returns 排序後串接的鍵（`min:max`）
 */
export const directKeyOf = (a: string, b: string): string =>
  [a, b].sort().join(':');
