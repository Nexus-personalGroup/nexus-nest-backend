export const CHAT_RETENTION_PORT = 'CHAT_RETENTION_PORT';

export interface ChatRetentionResult {
  auditLogs: number;
  reports: number;
}

/**
 * 聊天資料的保留清理。
 *
 * **刻意不含訊息。** 清理訊息會讓 `seq` 重新出現洞，而補齊的客戶端無法區分
 * 「被清掉」與「我漏收了」——那正是訊息撤回堅持軟刪除所要避免的問題。
 * 要清訊息必須先讓斷線補齊能表達「最舊的可用 seq」，那是另一個 change。
 * 有守則（`retention-scope.spec.ts`）擋著這件事。
 */
export interface ChatRetentionPort {
  /** 刪除 `createdAt` 早於 cutoff 的稽核紀錄 */
  purgeAuditBefore(cutoff: Date): Promise<number>;

  /**
   * 刪除**已判定**且 `reviewedAt` 早於 cutoff 的檢舉。
   *
   * 未判定（`PENDING`）的一律不動：按建立時間清會讓積壓的佇列靜默地把證據刪掉，
   * 而積壓正是最需要那些證據的時候。
   */
  purgeReviewedReportsBefore(cutoff: Date): Promise<number>;
}
