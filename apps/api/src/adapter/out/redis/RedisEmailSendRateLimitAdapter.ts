import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import { getEnv } from '@app/infrastructure/validate-env';
import {
  EMAIL_SEND_RATE_LIMIT_PORT,
  EmailSendPurpose,
  EmailSendRateLimitPort,
} from '@app/application/port/out/shared/EmailSendRateLimitPort';
import { buildEmailSendRateKey } from '@app/infrastructure/redis/cache-keys';

export { EMAIL_SEND_RATE_LIMIT_PORT };

/**
 * 以 Redis 滑動視窗實作寄信限流。
 *
 * 重用 `throttleIncrement`（HTTP 限流與訊息限流都是用它）：它是 Lua script 的
 * 原子操作，且 Redis 不可用時 fail-closed。自己再寫一份 GET+SET 會引入競態，
 * 而競態的症狀是「限流偶爾失效」——沒有人會發現。
 */
@Injectable()
export class RedisEmailSendRateLimitAdapter implements EmailSendRateLimitPort {
  constructor(private readonly redis: RedisService) {}

  async hitAndCheck(
    email: string,
    purpose: EmailSendPurpose,
  ): Promise<boolean> {
    // 閾值每次讀取而非建構時快取：測試會覆寫環境變數，快取會讓覆寫無效
    const { EMAIL_SEND_RATE_LIMIT, EMAIL_SEND_RATE_WINDOW_SEC } = getEnv();
    const count = await this.redis.throttleIncrement(
      buildEmailSendRateKey(this.redis.keyPrefix, purpose, email),
      EMAIL_SEND_RATE_WINDOW_SEC * 1000,
    );
    return count > EMAIL_SEND_RATE_LIMIT;
  }
}
