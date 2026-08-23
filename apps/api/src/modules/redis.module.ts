import { Global, Module } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis/redis.service';
import { RedisTokenBlacklistAdapter } from '../adapter/out/redis/RedisTokenBlacklistAdapter';
import { RedisMemberContextCacheAdapter } from '../adapter/out/redis/RedisMemberContextCacheAdapter';
import { RedisSessionActivityAdapter } from '../adapter/out/redis/RedisSessionActivityAdapter';
import { RedisPresenceAdapter } from '../adapter/out/redis/RedisPresenceAdapter';
import { RedisEmailSendRateLimitAdapter } from '../adapter/out/redis/RedisEmailSendRateLimitAdapter';
import { TOKEN_BLACKLIST_PORT } from '../application/port/out/auth/TokenBlacklistPort';
import { CLEAR_MEMBER_CONTEXT_PORT } from '../application/port/out/member/ClearMemberContextPort';
import { MEMBER_CONTEXT_CACHE_PORT } from '../application/port/out/member/MemberContextCachePort';
import { SESSION_ACTIVITY_PORT } from '../application/port/out/auth/SessionActivityPort';
import { PRESENCE_PORT } from '../application/port/out/presence/PresencePort';
import { EMAIL_SEND_RATE_LIMIT_PORT } from '../application/port/out/shared/EmailSendRateLimitPort';

/**
 * @Global() — 所有 Redis-backed Port 在此統一提供，
 * 無需在各 Module 重複宣告，符合 DRY 原則。
 */
@Global()
@Module({
  providers: [
    RedisService,
    RedisTokenBlacklistAdapter,
    { provide: TOKEN_BLACKLIST_PORT, useExisting: RedisTokenBlacklistAdapter },
    {
      provide: CLEAR_MEMBER_CONTEXT_PORT,
      useExisting: RedisTokenBlacklistAdapter,
    },
    RedisMemberContextCacheAdapter,
    {
      provide: MEMBER_CONTEXT_CACHE_PORT,
      useExisting: RedisMemberContextCacheAdapter,
    },
    RedisSessionActivityAdapter,
    {
      provide: SESSION_ACTIVITY_PORT,
      useExisting: RedisSessionActivityAdapter,
    },
    RedisPresenceAdapter,
    { provide: PRESENCE_PORT, useExisting: RedisPresenceAdapter },
    RedisEmailSendRateLimitAdapter,
    {
      provide: EMAIL_SEND_RATE_LIMIT_PORT,
      useExisting: RedisEmailSendRateLimitAdapter,
    },
  ],
  exports: [
    RedisService,
    TOKEN_BLACKLIST_PORT,
    CLEAR_MEMBER_CONTEXT_PORT,
    MEMBER_CONTEXT_CACHE_PORT,
    SESSION_ACTIVITY_PORT,
    PRESENCE_PORT,
    EMAIL_SEND_RATE_LIMIT_PORT,
  ],
})
export class RedisModule {}
