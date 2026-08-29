import { Inject, Injectable, Logger } from '@nestjs/common';
import { IpBlockPort } from '../../../application/port/out/security/IpBlockPort';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { buildFailedIpKey } from '../../../infrastructure/redis/cache-keys';
import {
  METRICS_PORT,
  MetricsPort,
} from '../../../application/port/out/MetricsPort';

/**
 * IP 登入失敗計數 Adapter（Redis）。
 * Redis 不可用時 graceful degradation，回傳 0（不計數）——刻意放行，
 * 理由同 `PrismaAccountLockAdapter`。放行必須留下痕跡：
 * 那段期間 IP 黑名單整組不會觸發。
 */
@Injectable()
export class RedisIpBlockAdapter implements IpBlockPort {
  /** 計數 TTL（秒） */
  private readonly COUNTER_TTL = 3600; // 1 小時

  private readonly logger = new Logger(RedisIpBlockAdapter.name);

  constructor(
    private readonly redis: RedisService,
    @Inject(METRICS_PORT)
    private readonly metrics: MetricsPort,
  ) {}

  async recordFailedIpAttempt(ip: string): Promise<number> {
    if (!this.redis.isAvailable) {
      this.logger.warn(
        'Redis 不可用，IP 失敗計數未生效——此期間 IP 黑名單不會觸發',
      );
      this.metrics.incrementSecurityDegraded('ip-block');
      return 0;
    }
    const key = buildFailedIpKey(this.redis.keyPrefix, ip);
    return this.redis.increment(key, this.COUNTER_TTL);
  }

  async resetIpAttempts(ip: string): Promise<void> {
    const key = buildFailedIpKey(this.redis.keyPrefix, ip);
    await this.redis.del(key);
  }
}
