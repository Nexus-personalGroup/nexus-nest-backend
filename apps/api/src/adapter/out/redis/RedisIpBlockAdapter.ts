import { Injectable } from '@nestjs/common';
import { IpBlockPort } from '../../../application/port/out/security/IpBlockPort';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { buildFailedIpKey } from '../../../infrastructure/redis/cache-keys';

/**
 * IP 登入失敗計數 Adapter（Redis）。
 * Redis 不可用時 graceful degradation，回傳 0（不計數）。
 */
@Injectable()
export class RedisIpBlockAdapter implements IpBlockPort {
  /** 計數 TTL（秒） */
  private readonly COUNTER_TTL = 3600; // 1 小時

  constructor(private readonly redis: RedisService) {}

  async recordFailedIpAttempt(ip: string): Promise<number> {
    if (!this.redis.isAvailable) return 0;
    const key = buildFailedIpKey(this.redis.keyPrefix, ip);
    return this.redis.increment(key, this.COUNTER_TTL);
  }

  async resetIpAttempts(ip: string): Promise<void> {
    const key = buildFailedIpKey(this.redis.keyPrefix, ip);
    await this.redis.del(key);
  }
}
