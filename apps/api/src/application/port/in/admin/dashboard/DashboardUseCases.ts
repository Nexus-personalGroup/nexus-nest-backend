export const GET_DASHBOARD_SNAPSHOT_USE_CASE =
  'GET_DASHBOARD_SNAPSHOT_USE_CASE';

/**
 * 營運總覽的一組數字。
 *
 * **只有聚合數字，沒有任何識別資訊**——沒有 email、沒有房間名稱、沒有訊息內容。
 * 儀表板回答的是「現在怎麼樣」，要看是誰、是哪個房間都該去對應的列表頁。
 */
export interface DashboardSnapshot {
  /** 目前有連線的成員數（跨實例，來自 Redis） */
  onlineMembers: number;
  /** 待處理的檢舉數 */
  pendingReports: number;
  totalRooms: number;
  /** 未軟刪除的成員數 */
  totalMembers: number;
  /** 今日訊息數；日界依 `APP_TIMEZONE` 而非 UTC */
  messagesToday: number;
  /**
   * 產生這組數字的時間。
   *
   * 一組沒有時間戳的即時數字，在連線中斷後看起來與即時數字一模一樣——
   * 呼叫端要能顯示「最後更新於」。
   */
  generatedAt: Date;
}

export interface GetDashboardSnapshotUseCase {
  execute(): Promise<DashboardSnapshot>;
}
