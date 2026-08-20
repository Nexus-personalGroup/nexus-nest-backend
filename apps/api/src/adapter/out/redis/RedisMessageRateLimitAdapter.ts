import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import { getEnv } from '@app/infrastructure/validate-env';
import {
  MESSAGE_RATE_LIMIT_PORT,
  MessageRateLimitPort,
} from '@app/application/port/out/MessageRateLimitPort';

export { MESSAGE_RATE_LIMIT_PORT };

/**
 * 以 Redis 滑動視窗實作送訊息限流。
 *
 * 直接重用 `throttleIncrement`（HTTP 限流也是用它）：它是 Lua script 的原子操作，
 * 且 Redis 不可用時預設 fail-closed。自己再寫一份 GET+SET 會引入競態，
 * 而競態的症狀是「限流偶爾失效」——沒有人會發現。
 */
@Injectable()
export class RedisMessageRateLimitAdapter implements MessageRateLimitPort {
  constructor(private readonly redis: RedisService) {}

  async hitAndCheck(memberId: string, roomId: string): Promise<boolean> {
    // 閾值每次讀取而非建構時快取：測試會覆寫環境變數，快取會讓覆寫無效
    const { WS_MESSAGE_RATE_LIMIT, WS_MESSAGE_RATE_WINDOW_SEC } = getEnv();
    const count = await this.redis.throttleIncrement(
      `chat:rate:${memberId}:${roomId}`,
      WS_MESSAGE_RATE_WINDOW_SEC * 1000,
    );
    return count > WS_MESSAGE_RATE_LIMIT;
  }
}
