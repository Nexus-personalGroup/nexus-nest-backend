import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import {
  TokenBlacklistPort,
  type BlacklistLookup,
  type BlacklistReason,
} from '../../../application/port/out/auth/TokenBlacklistPort';
import { ClearMemberContextPort } from '../../../application/port/out/member/ClearMemberContextPort';
import { buildMemberContextKey } from '../../../infrastructure/redis/cache-keys';
import { getEnv } from '../../../infrastructure/validate-env';

/**
 * Outbound Adapter：同時實作 TokenBlacklistPort 和 ClearMemberContextPort。
 * 兩者都委派給 RedisService，但在應用層保持職責分離。
 */
@Injectable()
export class RedisTokenBlacklistAdapter
  implements TokenBlacklistPort, ClearMemberContextPort, OnModuleInit
{
  private keyPrefix = '';

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    this.keyPrefix = getEnv().REDIS_KEY_PREFIX;
  }

  addToBlacklist(
    token: string,
    ttlSeconds: number,
    reason: BlacklistReason,
  ): Promise<void> {
    return this.redis.addToBlacklist(token, ttlSeconds, reason);
  }

  isBlacklisted(token: string): Promise<boolean> {
    return this.redis.isTokenBlacklisted(token);
  }

  async getBlacklistReason(token: string): Promise<BlacklistLookup> {
    const stored = await this.redis.getBlacklistReason(token);
    // null 專屬於「不在黑名單」。在黑名單但值無法辨識（改用 reason 之前寫入的
    // 舊格式 '1'）必須回 'unknown' 而非 null——回 null 會讓呼叫端當成沒進過黑名單
    // 而放行，等於部署當下把所有既存的已登出 / 已輪替 token 全部復活。
    if (stored === null) return null;
    return stored === 'rotated' || stored === 'logout' ? stored : 'unknown';
  }

  async clearMemberContext(memberId: string): Promise<void> {
    await this.redis.del(buildMemberContextKey(this.keyPrefix, memberId));
  }
}
