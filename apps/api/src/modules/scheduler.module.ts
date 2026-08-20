import { Module } from '@nestjs/common';
import { ExampleScheduler } from '../adapter/in/scheduler/ExampleScheduler';
import { LogRetentionScheduler } from '../adapter/in/scheduler/LogRetentionScheduler';
import { PurgeLogsService } from '../application/service/shared/PurgeLogsService';
import { PrismaLogPurgeRepository } from '../adapter/out/persistence/PrismaLogPurgeRepository';
import { PURGE_LOGS_PORT } from '../application/port/out/shared/PurgeLogsPort';

/**
 * 排程模組：集中宣告以 @nestjs/schedule 動態 cron 為基礎的排程器。
 *
 * SchedulerRegistry 由 AppModule 的 `ScheduleModule.forRoot()` 全域提供，此處只需註冊排程器 provider。
 * 新增排程：仿照 ExampleScheduler 建立排程器，再加進此 providers 即可。
 */
@Module({
  providers: [
    ExampleScheduler,
    LogRetentionScheduler,
    PurgeLogsService,
    PrismaLogPurgeRepository,
    {
      provide: PURGE_LOGS_PORT,
      useExisting: PrismaLogPurgeRepository,
    },
  ],
})
export class SchedulerModule {}
