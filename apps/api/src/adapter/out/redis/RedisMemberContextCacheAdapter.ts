import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { MemberContextCachePort } from '../../../application/port/out/member/MemberContextCachePort';
import { buildMemberContextKey } from '../../../infrastructure/redis/cache-keys';
import { getEnv } from '../../../infrastructure/validate-env';

/**
 * Outbound Adapter：將 MemberContextCachePort 委派給 RedisService。
 * 同一份快取的 get / set / clear 都在這裡，key 組合不外流。
 */
@Injectable()
export class RedisMemberContextCacheAdapter
  implements MemberContextCachePort, OnModuleInit
{
  private keyPrefix = '';

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    this.keyPrefix = getEnv().REDIS_KEY_PREFIX;
  }

  get isAvailable(): boolean {
    return this.redis.isAvailable;
  }

  async getByMemberId(memberId: string): Promise<string | null> {
    return this.redis.get(buildMemberContextKey(this.keyPrefix, memberId));
  }

  async setByMemberId(
    memberId: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(
      buildMemberContextKey(this.keyPrefix, memberId),
      value,
      ttlSeconds,
    );
  }

  async clearByMemberId(memberId: string): Promise<void> {
    await this.redis.del(buildMemberContextKey(this.keyPrefix, memberId));
  }

  async clearMany(memberIds: string[]): Promise<void> {
    await this.redis.delMany(
      memberIds.map((id) => buildMemberContextKey(this.keyPrefix, id)),
    );
  }
}
