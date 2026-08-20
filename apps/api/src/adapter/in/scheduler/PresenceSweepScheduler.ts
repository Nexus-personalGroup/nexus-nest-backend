import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import {
  PRESENCE_PORT,
  PresencePort,
} from '@app/application/port/out/presence/PresencePort';
import { getEnv } from '@app/infrastructure/validate-env';

const CRON_NAME = 'presence-sweep';

/**
 * 定期清除陳舊的在線紀錄
 *
 * 讀取時的過濾已經讓陳舊紀錄不被採信，因此**本排程不影響正確性**，
 * 只負責回收空間——實例被強制終止後留下的欄位若不刪，會一直佔著 Redis。
 *
 * 每個實例都會跑，重複清同一批資料是無害的（`HDEL` 冪等）。刻意不做分散式鎖：
 * 為了一個冪等且低頻的清理動作引入鎖，代價高於它解決的問題。
 *
 * 與其他排程同樣採動態註冊而非 `@Cron()` 裝飾器——裝飾器內的 cron 表達式在
 * 模組載入時就求值，早於 main.ts 的 dotenv.config()，讀不到 .env。
 */
@Injectable()
export class PresenceSweepScheduler implements OnModuleInit {
  private readonly logger = new Logger(PresenceSweepScheduler.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    @Inject(PRESENCE_PORT) private readonly presence: PresencePort,
  ) {}

  onModuleInit(): void {
    const env = getEnv();
    // 掃描頻率取心跳間隔的兩倍：比陳舊門檻密集才不會讓垃圾累積，
    // 又不必每個心跳週期都掃一次全庫
    const intervalSeconds = env.WS_HEARTBEAT_INTERVAL * 2;

    const job = CronJob.from({
      cronTime: `*/${intervalSeconds} * * * * *`,
      onTick: () => void this.run(),
      timeZone: env.APP_TIMEZONE,
    });
    this.registry.addCronJob(CRON_NAME, job);
    job.start();
    this.logger.log(`在線狀態清理排程已啟動（每 ${intervalSeconds} 秒）`);
  }

  private async run(): Promise<void> {
    try {
      await this.presence.sweepStale();
    } catch (error) {
      // Redis 不可用時 presence 會拋出。清理失敗不影響服務，記錄後等下一輪即可——
      // 這裡若讓例外逃出去會變成未處理的 rejection 並終止行程
      this.logger.warn(
        `在線狀態清理失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
      );
    }
  }
}
