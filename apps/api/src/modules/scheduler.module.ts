import { Module } from '@nestjs/common';
import { ExampleScheduler } from '../adapter/in/scheduler/ExampleScheduler';
import { LogRetentionScheduler } from '../adapter/in/scheduler/LogRetentionScheduler';
import { ChatRetentionScheduler } from '../adapter/in/scheduler/ChatRetentionScheduler';
import { PresenceSweepScheduler } from '../adapter/in/scheduler/PresenceSweepScheduler';
import { PurgeLogsService } from '../application/service/shared/PurgeLogsService';
import { PrismaLogPurgeRepository } from '../adapter/out/persistence/PrismaLogPurgeRepository';
import { PURGE_LOGS_PORT } from '../application/port/out/shared/PurgeLogsPort';
import { ChatRetentionService } from '../application/service/shared/ChatRetentionService';
import { PrismaChatRetentionRepository } from '../adapter/out/persistence/PrismaChatRetentionRepository';
import { CHAT_RETENTION_PORT } from '../application/port/out/shared/ChatRetentionPort';

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
    // 與日誌保留分開的排程：兩者的保留期限、開關、失效後果都不同
    ChatRetentionScheduler,
    // PRESENCE_PORT 由 @Global() 的 RedisModule 提供，此處不需 import
    PresenceSweepScheduler,
    PurgeLogsService,
    PrismaLogPurgeRepository,
    {
      provide: PURGE_LOGS_PORT,
      useExisting: PrismaLogPurgeRepository,
    },
    ChatRetentionService,
    PrismaChatRetentionRepository,
    {
      provide: CHAT_RETENTION_PORT,
      useExisting: PrismaChatRetentionRepository,
    },
  ],
})
export class SchedulerModule {}
