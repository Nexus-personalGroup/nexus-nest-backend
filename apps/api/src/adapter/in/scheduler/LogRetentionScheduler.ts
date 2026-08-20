import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { getEnv } from '@app/infrastructure/validate-env';
import { PurgeLogsService } from '@app/application/service/shared/PurgeLogsService';

const CRON_NAME = 'log-retention-purge';

/**
 * 日誌保留排程：每日清掉超過保留天數的 system_logs 與 auth_logs。
 *
 * **預設啟用**，與 `SCHEDULE_ENABLED`（範例排程的開關）無關。
 * 理由：沒有保留策略的後果是資料庫無界成長，而這兩張表只寫不讀；
 * 相對地「刪掉 90 天前、沒有任何功能在讀的日誌」風險極低。
 * 日誌 flag 全關時本排程只是每天跑一次空的 deleteMany，成本可忽略。
 *
 * 與 ExampleScheduler 同樣採動態註冊而非 `@Cron()` 裝飾器——裝飾器內的 cron
 * 表達式在模組載入時就求值，早於 main.ts 的 dotenv.config()，讀不到 .env。
 */
@Injectable()
export class LogRetentionScheduler implements OnModuleInit {
  private readonly logger = new Logger(LogRetentionScheduler.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly purgeLogsService: PurgeLogsService,
  ) {}

  onModuleInit(): void {
    const env = getEnv();
    if (!env.LOG_PURGE_ENABLED) {
      this.logger.warn(
        '日誌保留排程已停用（LOG_PURGE_ENABLED=false）——system_logs / auth_logs 將無界成長',
      );
      return;
    }

    const job = CronJob.from({
      cronTime: env.LOG_PURGE_CRON,
      onTick: () => void this.run(env.LOG_RETENTION_DAYS),
      timeZone: env.APP_TIMEZONE,
    });
    this.registry.addCronJob(CRON_NAME, job);
    job.start();
    this.logger.log(
      `日誌保留排程啟動：${env.LOG_PURGE_CRON}（保留 ${env.LOG_RETENTION_DAYS} 天）`,
    );
  }

  /** 清理失敗不得讓排程整個掛掉，下一次觸發仍要照跑 */
  private async run(retentionDays: number): Promise<void> {
    try {
      await this.purgeLogsService.purge(retentionDays);
    } catch (error) {
      this.logger.error('日誌清理失敗', error);
    }
  }
}
