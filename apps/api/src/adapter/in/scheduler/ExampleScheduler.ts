import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { getEnv } from '../../../infrastructure/validate-env';

const CRON_NAME = 'example-heartbeat';

/**
 * 範例排程器：示範以「動態註冊」方式掛載 cron 任務。
 *
 * 為何不用 `@Cron()` decorator 而改在 onModuleInit 動態註冊：
 * decorator 內的 cron 表達式在「模組載入時」就求值，早於 main.ts 的 dotenv.config()，
 * 此時讀不到 .env（若在 decorator 內呼叫 getEnv() 更會在 env 尚未載入時觸發驗證而 process.exit）。
 * 改在 onModuleInit（env 已載入）以 SchedulerRegistry.addCronJob 註冊才安全。
 *
 * 預設停用（SCHEDULE_ENABLED=false）。實際排程請仿此改寫：
 * 注入所需 UseCase、把 run() 換成真正邏輯、視需要複製成多個排程器並在 SchedulerModule 註冊。
 */
@Injectable()
export class ExampleScheduler implements OnModuleInit {
  private readonly logger = new Logger(ExampleScheduler.name);

  constructor(private readonly registry: SchedulerRegistry) {}

  onModuleInit(): void {
    const env = getEnv();
    if (!env.SCHEDULE_ENABLED) {
      this.logger.log('範例排程已停用（SCHEDULE_ENABLED=false）');
      return;
    }
    const job = CronJob.from({
      cronTime: env.SCHEDULE_EXAMPLE_CRON,
      onTick: () => this.run(),
      timeZone: env.APP_TIMEZONE,
    });
    this.registry.addCronJob(CRON_NAME, job);
    job.start();
    this.logger.log(`範例排程啟動：${env.SCHEDULE_EXAMPLE_CRON}`);
  }

  /** 排程觸發時執行的工作；範例僅印 heartbeat，實作時替換為真正邏輯 */
  private run(): void {
    this.logger.log('範例排程 heartbeat');
  }
}
