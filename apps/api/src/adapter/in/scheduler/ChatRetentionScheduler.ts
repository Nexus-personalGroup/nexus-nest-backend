import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { getEnv } from '@app/infrastructure/validate-env';
import { ChatRetentionService } from '@app/application/service/shared/ChatRetentionService';

const CRON_NAME = 'chat-retention-purge';

/**
 * 聊天資料的保留排程：每日清掉逾期的稽核紀錄與已判定的檢舉。
 *
 * **與日誌保留分成兩支排程**，不共用開關：兩者的失效後果不同——
 * 日誌關掉只是磁碟長大，稽核關掉會讓日後的調查沒有依據。
 * 共用會讓「調整日誌保留」這個低風險操作順手改到稽核。
 *
 * 與其他排程同樣採動態註冊而非 `@Cron()` 裝飾器——裝飾器內的 cron 表達式
 * 在模組載入時就求值，早於 main.ts 的 dotenv.config()，讀不到 .env。
 */
@Injectable()
export class ChatRetentionScheduler implements OnModuleInit {
  private readonly logger = new Logger(ChatRetentionScheduler.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly retentionService: ChatRetentionService,
  ) {}

  onModuleInit(): void {
    const env = getEnv();
    if (!env.CHAT_RETENTION_ENABLED) {
      // warn 而非 log：無界成長是知情的選擇，不該無聲發生
      this.logger.warn(
        '聊天資料保留排程已停用（CHAT_RETENTION_ENABLED=false）——稽核紀錄與檢舉將無界成長',
      );
      return;
    }

    const job = CronJob.from({
      cronTime: env.CHAT_RETENTION_CRON,
      onTick: () =>
        void this.run(
          env.CHAT_AUDIT_RETENTION_DAYS,
          env.CHAT_REPORT_RETENTION_DAYS,
        ),
      timeZone: env.APP_TIMEZONE,
    });
    this.registry.addCronJob(CRON_NAME, job);
    job.start();
    this.logger.log(
      `聊天資料保留排程啟動：${env.CHAT_RETENTION_CRON}` +
        `（稽核 ${env.CHAT_AUDIT_RETENTION_DAYS} 天、檢舉判定後 ${env.CHAT_REPORT_RETENTION_DAYS} 天）`,
    );
  }

  /** 清理失敗不得讓排程整個掛掉，下一次觸發仍要照跑 */
  private async run(auditDays: number, reportDays: number): Promise<void> {
    try {
      await this.retentionService.purge(auditDays, reportDays);
    } catch (error) {
      this.logger.error('聊天資料清理失敗', error);
    }
  }
}
