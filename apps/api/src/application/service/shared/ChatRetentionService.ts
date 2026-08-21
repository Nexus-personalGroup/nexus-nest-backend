import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CHAT_RETENTION_PORT,
  ChatRetentionPort,
  ChatRetentionResult,
} from '@app/application/port/out/shared/ChatRetentionPort';

const MS_PER_DAY = 86_400_000;

/**
 * 聊天資料的保留策略。
 *
 * 兩張表的保留天數**各自獨立**：稽核只寫不讀且成長最快，檢舉量小但含內容快照。
 * 用同一個天數會逼其中一邊遷就另一邊。
 *
 * **訊息不在此列**——見 `ChatRetentionPort` 的說明，有守則擋著。
 */
@Injectable()
export class ChatRetentionService {
  private readonly logger = new Logger(ChatRetentionService.name);

  constructor(
    @Inject(CHAT_RETENTION_PORT)
    private readonly retention: ChatRetentionPort,
  ) {}

  /**
   * 依各自的保留天數清理稽核與檢舉
   *
   * @param auditRetentionDays - 稽核紀錄的保留天數（自建立時間起算）
   * @param reportRetentionDays - 檢舉的保留天數（自**判定時間**起算）
   * @returns 兩張表各自刪除的筆數
   */
  async purge(
    auditRetentionDays: number,
    reportRetentionDays: number,
  ): Promise<ChatRetentionResult> {
    const now = Date.now();
    const auditLogs = await this.retention.purgeAuditBefore(
      new Date(now - auditRetentionDays * MS_PER_DAY),
    );
    const reports = await this.retention.purgeReviewedReportsBefore(
      new Date(now - reportRetentionDays * MS_PER_DAY),
    );

    this.logger.log(
      `聊天資料清理完成：稽核 ${auditLogs} 筆（保留 ${auditRetentionDays} 天）、` +
        `已判定檢舉 ${reports} 筆（判定後保留 ${reportRetentionDays} 天）`,
    );
    return { auditLogs, reports };
  }
}
