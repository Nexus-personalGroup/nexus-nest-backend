export const EVENT_PUBLISHER_PORT = 'EVENT_PUBLISHER_PORT';

/**
 * 即時事件的送出端
 *
 * application 層只認這個介面，不認 Socket.IO。這讓「送給誰」的業務判斷
 * 與「怎麼送到」的傳輸細節分開——service 的測試不需要起一個 WebSocket 伺服器。
 *
 * **實作必須跨實例送達。** 只送到本行程持有的連線不構成本介面的實作：
 * 收件者連在哪個實例是隨機的，單機廣播等於隨機丟失訊息。
 */
export interface EventPublisherPort {
  /**
   * 送給某個房間的所有連線（含其他實例上的）
   *
   * @param roomId - 房間識別碼
   * @param event - 事件名稱
   * @param payload - 事件內容
   */
  publishToRoom(roomId: string, event: string, payload: unknown): void;

  /**
   * 送給某個成員的所有裝置（含其他實例上的）
   *
   * @param memberId - 成員 ID
   * @param event - 事件名稱
   * @param payload - 事件內容
   */
  publishToMember(memberId: string, event: string, payload: unknown): void;

  /**
   * 斷開某成員的所有連線（含其他實例上的）
   *
   * **必須在送出說明事件之後呼叫**——斷線後就沒有管道可以說明原因了。
   *
   * 這個方法存在的理由是一個「每一層都正確、但沒有人負責銜接」的缺口：
   * 連線層的認證只在 handshake 執行一次，之後的事件只驗資源層級的授權。
   * 帳號停用之後，既有的連線仍然可以繼續操作。
   *
   * **回傳 void 而非 Promise**：Socket.IO 的 `disconnectSockets()` 是同步的，
   * 跨實例的部分經 adapter 廣播出去、沒有完成訊號可等。宣告成 Promise
   * 會讓呼叫端以為 `await` 之後所有實例都斷乾淨了，而那不是事實。
   *
   * @param memberId - 成員 ID
   */
  disconnectMember(memberId: string): void;
}
