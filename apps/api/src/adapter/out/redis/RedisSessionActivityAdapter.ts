import { Injectable, OnModuleInit } from '@nestjs/common';
import { SessionActivityPort } from '../../../application/port/out/auth/SessionActivityPort';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { buildSessionActivityKey } from '../../../infrastructure/redis/cache-keys';

/**
 * Session 活動追蹤 Adapter（Redis）。
 * 使用 Redis key + TTL 機制：key 存在代表 session 活躍，
 * key 過期（消失）代表閒置超時。
 *
 * Redis 不可用時 graceful degradation（視為活躍，不鎖定使用者）。
 */
@Injectable()
export class RedisSessionActivityAdapter
  implements SessionActivityPort, OnModuleInit
{
  private keyPrefix = '';

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    this.keyPrefix = this.redis.keyPrefix;
  }

  async touchActivity(memberId: string, ttlMinutes: number): Promise<void> {
    const key = buildSessionActivityKey(this.keyPrefix, memberId);
    await this.redis.set(key, '1', ttlMinutes * 60);
  }

  async isActive(memberId: string): Promise<boolean> {
    // Redis 不可用時 graceful degradation：視為活躍
    if (!this.redis.isAvailable) return true;
    const key = buildSessionActivityKey(this.keyPrefix, memberId);
    const result = await this.redis.get(key);
    return result !== null;
  }
}
