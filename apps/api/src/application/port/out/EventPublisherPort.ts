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
   * 送給某個群組的所有連線（含其他實例上的）
   *
   * @param groupId - 群組識別碼
   * @param event - 事件名稱
   * @param payload - 事件內容
   */
  publishToGroup(groupId: string, event: string, payload: unknown): void;

  /**
   * 送給某個成員的所有裝置（含其他實例上的）
   *
   * @param memberId - 成員 ID
   * @param event - 事件名稱
   * @param payload - 事件內容
   */
  publishToMember(memberId: string, event: string, payload: unknown): void;
}
