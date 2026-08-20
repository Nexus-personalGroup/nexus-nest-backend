import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  PurgeLogsPort,
  PurgeLogsResult,
} from '@app/application/port/out/shared/PurgeLogsPort';

/** 單批刪除筆數。夠大以免往返太多次，夠小以免單次交易持鎖過久 */
const BATCH_SIZE = 5_000;

/** 每批之間的讓出時間（毫秒），給正常寫入插隊的機會 */
const BATCH_PAUSE_MS = 100;

/** 保險上限：避免任何意外造成無限迴圈（5000 × 2000 = 一千萬列） */
const MAX_BATCHES = 2_000;

/** 允許清理的資料表，型別上鎖死——表名走 Prisma.raw，不能接受任意字串 */
type PurgeableTable = 'system_logs' | 'auth_logs';

@Injectable()
export class PrismaLogPurgeRepository implements PurgeLogsPort {
  private readonly logger = new Logger(PrismaLogPurgeRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 刪除 createdAt 早於 cutoff 的日誌
   *
   * 兩張表分開刪除、不包 transaction：它們之間沒有一致性關係，
   * 而長交易在大量刪除時會壓住 undo log 並拉長鎖持有時間。
   *
   * @param cutoff - 保留界線
   * @returns 兩張表各自刪除的筆數
   */
  async purgeLogsBefore(cutoff: Date): Promise<PurgeLogsResult> {
    return {
      systemLogs: await this.purgeTable('system_logs', cutoff),
      authLogs: await this.purgeTable('auth_logs', cutoff),
    };
  }

  /**
   * 分批刪除單一資料表
   *
   * **不用 `deleteMany`**：它產生單一無界的 `DELETE`，而單一 DELETE 本身就是一個交易——
   * 與顯式交易在持鎖時間與 undo log 上沒有本質差別。這個排程要解決的正是
   * 「跑了一年、日誌累積數百萬列」的部署，第一次執行那一發會長時間持鎖、
   * 阻塞同表寫入，變成「防止資料庫爆掉的機制自己造成一次事故」。
   *
   * @param table - 要清理的資料表
   * @param cutoff - 保留界線
   * @returns 刪除總筆數
   */
  private async purgeTable(
    table: PurgeableTable,
    cutoff: Date,
  ): Promise<number> {
    let total = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      // 表名以 Prisma.raw 帶入，但來源是上方的字面值聯合型別，沒有注入面；
      // cutoff 與筆數仍走參數綁定
      //
      // PostgreSQL 的 DELETE **不支援 LIMIT**，分批必須靠子查詢挑出目標列。
      // 用 ctid 而非 id：ctid 是實體位置，省掉「查 PK → 再用 PK 找列」的第二次索引查找。
      // 子查詢與 DELETE 在同一個 statement 的快照內求值，且這兩張表是唯寫入不更新的
      // 日誌表，不存在 ctid 在中途飄掉的情況。
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM ${Prisma.raw(table)}
        WHERE ctid IN (
          SELECT ctid FROM ${Prisma.raw(table)}
          WHERE created_at < ${cutoff}
          ORDER BY created_at
          LIMIT ${BATCH_SIZE}
        )`;

      total += deleted;
      if (deleted < BATCH_SIZE) return total;

      await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
    }

    this.logger.warn(
      `${table} 清理達批次上限（${MAX_BATCHES} 批 / ${total} 筆）而中止，下次排程會接續清理`,
    );
    return total;
  }
}
