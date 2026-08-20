import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { AccountLockPort } from '@app/application/port/out/auth/AccountLockPort';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import { buildFailedLoginKey } from '@app/infrastructure/redis/cache-keys';

/**
 * 帳號鎖定 Adapter：
 * - Redis：即時失敗計數（INCR + TTL）
 * - DB：持久化鎖定狀態（lockedAt）
 *
 * Redis 不可用時 graceful degradation（不計數，但 DB 鎖定仍有效）。
 */
@Injectable()
export class PrismaAccountLockAdapter implements AccountLockPort {
  /** 失敗計數在 Redis 中的 TTL（秒），超過後自動重置 */
  private readonly COUNTER_TTL = 1800; // 30 分鐘

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async recordFailedLogin(email: string): Promise<number> {
    // Redis 計數（失敗時 graceful degradation，回傳 0）
    if (!this.redis.isAvailable) return 0;
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

  async isLocked(email: string): Promise<boolean> {
    // 軟刪 model 的 read path 一律加 deletedAt: null（findUnique 不支援非唯一條件 → 改 findFirst）
    const record = await this.prisma.memberRecord.findFirst({
      where: { email, deletedAt: null },
      select: { lockedAt: true },
    });
    return record?.lockedAt !== null && record?.lockedAt !== undefined;
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
