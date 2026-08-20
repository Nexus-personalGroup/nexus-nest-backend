export const PURGE_LOGS_PORT = 'PURGE_LOGS_PORT';

/** 一次清理的結果，供排程記錄實際刪除量 */
export interface PurgeLogsResult {
  systemLogs: number;
  authLogs: number;
}

export interface PurgeLogsPort {
  /**
   * 刪除 `createdAt` 早於 cutoff 的日誌
   * @param cutoff - 保留界線，早於此時間的紀錄會被刪除
   * @returns 兩張表各自刪除的筆數
   */
  purgeLogsBefore(cutoff: Date): Promise<PurgeLogsResult>;
}
