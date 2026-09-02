import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  AccountLockPage,
  AccountLockPort,
  AccountLockStatus,
  ListAccountLocksParams,
} from '@app/application/port/out/auth/AccountLockPort';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import { buildFailedLoginKey } from '@app/infrastructure/redis/cache-keys';
import { getEnv } from '@app/infrastructure/validate-env';
import {
  METRICS_PORT,
  MetricsPort,
} from '@app/application/port/out/MetricsPort';

/**
 * 帳號鎖定 Adapter：
 * - Redis：即時失敗計數（INCR + TTL）
 * - DB：持久化鎖定狀態（lockedAt）
 *
 * Redis 不可用時 graceful degradation（不計數，但 DB 鎖定仍有效）——
 * 擋下來等於把快取故障升級成全站故障，因此**刻意放行**。
 * 但放行必須留下痕跡：那段期間帳號鎖定整組不會觸發，
 * 沒有日誌與指標的話事後翻不出「當時防護是失效的」。
 */
@Injectable()
export class PrismaAccountLockAdapter implements AccountLockPort {
  /** 失敗計數在 Redis 中的 TTL（秒），超過後自動重置 */
  private readonly COUNTER_TTL = 1800; // 30 分鐘

  private readonly logger = new Logger(PrismaAccountLockAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(METRICS_PORT)
    private readonly metrics: MetricsPort,
  ) {}

  async recordFailedLogin(email: string): Promise<number> {
    // Redis 計數（失敗時 graceful degradation，回傳 0）
    if (!this.redis.isAvailable) {
      this.logger.warn(
        'Redis 不可用，登入失敗計數未生效——此期間帳號鎖定不會觸發',
      );
      this.metrics.incrementSecurityDegraded('account-lock');
      return 0;
    }
    const key = buildFailedLoginKey(this.redis.keyPrefix, email);
    const count = await this.redis.increment(key, this.COUNTER_TTL);

    // 同步更新 DB 的 failedLoginCount（排除軟刪記錄，避免打到同 email 的舊帳號）
    await this.prisma.memberRecord
      .updateMany({
        where: { email, deletedAt: null },
        data: { failedLoginCount: count },
      })
      .catch(() => {
        // DB 更新失敗不阻塞流程
      });

    return count;
  }

  async resetFailedLogin(email: string): Promise<void> {
    const key = buildFailedLoginKey(this.redis.keyPrefix, email);
    await this.redis.del(key);

    await this.prisma.memberRecord
      .updateMany({
        where: { email, deletedAt: null },
        data: { failedLoginCount: 0, lockedAt: null },
      })
      .catch(() => {
        // DB 更新失敗不阻塞流程
      });
  }

  /** 鎖定時效（毫秒）。設定的唯一讀取點 */
  private lockDurationMs(): number {
    return getEnv().APPLICATION_ACCOUNT_LOCK_DURATION_MIN * 60_000;
  }

  /**
   * 鎖定時效的**唯一判準**：`lockedAt` 早於（或等於）這個時間點就是已到期。
   *
   * `checkLock` 與 `listLocks` 都走這裡。兩邊各自算的話會漂移，
   * 而漂移的症狀是「列表說鎖著、但那個人登得進去」——
   * 看起來像資料不同步，實際上是兩份規則。
   */
  private lockCutoff(now: Date = new Date()): Date {
    return new Date(now.getTime() - this.lockDurationMs());
  }

  /** 自動解鎖時間，供列表顯示「還要等多久」 */
  private unlocksAt(lockedAt: Date): Date {
    return new Date(lockedAt.getTime() + this.lockDurationMs());
  }

  async checkLock(email: string): Promise<AccountLockStatus> {
    // 軟刪 model 的 read path 一律加 deletedAt: null（findUnique 不支援非唯一條件 → 改 findFirst）
    const record = await this.prisma.memberRecord.findFirst({
      where: { email, deletedAt: null },
      select: { lockedAt: true },
    });
    if (!record?.lockedAt) return 'NONE';

    // 純比對，不寫入：到期後該清的失敗計數由呼叫端處理
    return record.lockedAt > this.lockCutoff() ? 'LOCKED' : 'EXPIRED';
  }

  async listLocks(params: ListAccountLocksParams): Promise<AccountLockPage> {
    const cutoff = this.lockCutoff();
    // 過濾條件與逐列判定用同一個 cutoff：分兩次取 `new Date()` 的話，
    // 邊界上的那一筆可能被查出來卻標成另一個狀態
    const byStatus =
      params.status === 'locked'
        ? { gt: cutoff }
        : params.status === 'expired'
          ? { lte: cutoff }
          : { not: null };

    const where = {
      deletedAt: null,
      lockedAt: byStatus,
      ...(params.search
        ? { email: { contains: params.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.memberRecord.findMany({
        where,
        select: {
          id: true,
          email: true,
          member: true,
          lockedAt: true,
          failedLoginCount: true,
        },
        orderBy: { lockedAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.memberRecord.count({ where }),
    ]);

    return {
      total,
      list: records
        // lockedAt 在型別上可為 null，但 where 已排除；filter 讓型別收斂而非用 !
        .filter((r): r is typeof r & { lockedAt: Date } => r.lockedAt !== null)
        .map((r) => ({
          id: r.id,
          email: r.email,
          member: r.member,
          lockedAt: r.lockedAt,
          unlocksAt: this.unlocksAt(r.lockedAt),
          failedLoginCount: r.failedLoginCount,
          status:
            r.lockedAt > cutoff ? ('locked' as const) : ('expired' as const),
        })),
    };
  }

  async lockAccount(email: string): Promise<void> {
    await this.prisma.memberRecord.updateMany({
      where: { email, deletedAt: null },
      data: { lockedAt: new Date() },
    });
  }

  async unlockAccount(email: string): Promise<void> {
    const key = buildFailedLoginKey(this.redis.keyPrefix, email);
    await this.redis.del(key);

    await this.prisma.memberRecord.updateMany({
      where: { email, deletedAt: null },
      data: { failedLoginCount: 0, lockedAt: null },
    });
  }
}
