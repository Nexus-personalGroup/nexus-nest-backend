import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  CHAT_RETENTION_PORT,
  ChatRetentionPort,
} from '@app/application/port/out/shared/ChatRetentionPort';

export { CHAT_RETENTION_PORT };

/** 沿用日誌清理的常數：夠大以免往返太多次，夠小以免單次交易持鎖過久 */
const BATCH_SIZE = 5_000;
const BATCH_PAUSE_MS = 100;
const MAX_BATCHES = 2_000;

/**
 * 允許清理的資料表，型別上鎖死。
 *
 * **`chat_messages` 刻意不在這裡**，而且不只是「沒列進來」——
 * 型別鎖死代表任何人想加它都必須先改這一行，而改這一行會看到下方的說明。
 */
type PurgeableChatTable = 'chat_audit_logs' | 'chat_reports';

@Injectable()
export class PrismaChatRetentionRepository implements ChatRetentionPort {
  private readonly logger = new Logger(PrismaChatRetentionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  purgeAuditBefore(cutoff: Date): Promise<number> {
    return this.purgeInBatches(
      'chat_audit_logs',
      Prisma.sql`created_at < ${cutoff}`,
      Prisma.sql`created_at`,
    );
  }

  purgeReviewedReportsBefore(cutoff: Date): Promise<number> {
    // 條件是 reviewed_at 而非 created_at，且排除未判定的。
    // 寫成 `reviewed_at < cutoff` 已經隱含 `reviewed_at IS NOT NULL`
    // （NULL 的比較結果是 NULL，不會被 WHERE 採納），但仍明寫 status 條件——
    // 讓「未判定的不清」在 SQL 裡看得見，而不是靠讀者推導 NULL 的三值邏輯
    return this.purgeInBatches(
      'chat_reports',
      Prisma.sql`reviewed_at < ${cutoff} AND status <> 'PENDING'::"chat_report_status"`,
      Prisma.sql`reviewed_at`,
    );
  }

  /**
   * 分批刪除。
   *
   * **不用 `deleteMany`**：它產生單一無界的 `DELETE`，而單一 DELETE 本身就是一個交易。
   * 這個排程要解決的正是「跑了很久、資料累積數百萬列」的部署，
   * 第一次執行那一發會長時間持鎖、阻塞同表寫入，
   * 變成「防止資料庫爆掉的機制自己造成一次事故」。
   *
   * PostgreSQL 的 `DELETE` **不支援 LIMIT**，分批必須靠子查詢挑出目標列；
   * 用 `ctid`（實體位置）而非 id，省掉「查 PK → 再用 PK 找列」的第二次索引查找。
   */
  private async purgeInBatches(
    table: PurgeableChatTable,
    condition: Prisma.Sql,
    orderBy: Prisma.Sql,
  ): Promise<number> {
    let total = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM ${Prisma.raw(table)}
        WHERE ctid IN (
          SELECT ctid FROM ${Prisma.raw(table)}
          WHERE ${condition}
          ORDER BY ${orderBy}
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
