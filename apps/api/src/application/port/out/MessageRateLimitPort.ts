export const MESSAGE_RATE_LIMIT_PORT = 'MESSAGE_RATE_LIMIT_PORT';

/**
 * 送訊息的限流。
 *
 * HTTP 端有全域 throttle middleware，**WebSocket 完全不經過它**：連線建立後的每個事件
 * 都是同一條 TCP 連線上的訊框，沒有任何一層會計次。
 *
 * 計數以「成員 + 房間」為單位而非只看成員：同一個人在多個房間各自發言是正常行為，
 * 用單一計數器會讓活躍使用者被自己的正常使用擋下。
 */
export interface MessageRateLimitPort {
  /**
   * 記錄一次發送並回報是否超過閾值
   *
   * **必須是「記錄並判斷」而非「只判斷」**：分成兩次呼叫會有競態，
   * 同一瞬間的多則訊息可能全部讀到超標前的計數而一起放行。
   *
   * @returns true 代表已超過閾值，本次發送應被拒絕
   */
  hitAndCheck(memberId: string, roomId: string): Promise<boolean>;
}
