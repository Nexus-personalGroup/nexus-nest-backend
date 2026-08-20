import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PURGE_LOGS_PORT,
  PurgeLogsPort,
  PurgeLogsResult,
} from '@app/application/port/out/shared/PurgeLogsPort';

const MS_PER_DAY = 86_400_000;

/**
 * 日誌保留策略：刪除超過保留天數的 system_logs 與 auth_logs。
 *
 * 這兩張表只寫不讀（目前沒有任何查詢端點），而 `system_logs` 在
 * `APPLICATION_API_LOG_ENABLED=true` 時每個 API 請求都寫一筆、且完整存
 * request/response 的 `@db.Text`。沒有保留策略它會是整個資料庫成長最快的物件。
 */
@Injectable()
export class PurgeLogsService {
  private readonly logger = new Logger(PurgeLogsService.name);

  constructor(
    @Inject(PURGE_LOGS_PORT)
    private readonly purgeLogs: PurgeLogsPort,
  ) {}

  /**
   * 依保留天數清理日誌
   * @param retentionDays - 保留天數，早於此天數的紀錄會被刪除
   * @returns 兩張表各自刪除的筆數
   */
  async purge(retentionDays: number): Promise<PurgeLogsResult> {
    const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY);
    const result = await this.purgeLogs.purgeLogsBefore(cutoff);

    this.logger.log(
      `日誌清理完成（保留 ${retentionDays} 天）：system_logs ${result.systemLogs} 筆、auth_logs ${result.authLogs} 筆`,
    );
    return result;
  }
}
