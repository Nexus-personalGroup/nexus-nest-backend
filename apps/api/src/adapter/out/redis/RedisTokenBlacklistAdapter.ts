import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import {
  TokenBlacklistPort,
  type BlacklistLookup,
  type BlacklistReason,
} from '../../../application/port/out/auth/TokenBlacklistPort';

/**
 * Outbound Adapter：將 TokenBlacklistPort 委派給 RedisService。
 */
@Injectable()
export class RedisTokenBlacklistAdapter implements TokenBlacklistPort {
  constructor(private readonly redis: RedisService) {}

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
}
