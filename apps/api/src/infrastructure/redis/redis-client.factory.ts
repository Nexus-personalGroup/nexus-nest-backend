import { createClient, RedisClientType } from 'redis';
import { getEnv } from '../validate-env';

/** 初次連線的等待上限，避免無限卡住 */
const CONNECT_TIMEOUT_MS = 5000;
/** 定期送 PING 偵測 half-open（socket 開著卻無回應）連線並觸發 reconnect */
const PING_INTERVAL_MS = 30000;
const MAX_RETRIES = 5;

/**
 * 依環境設定建立一個 Redis client（尚未連線）
 *
 * 抽成獨立函式而非 `RedisService` 的方法，是因為 **`RedisIoAdapter` 必須在
 * `app.init()` 之前取得連線**——WebSocket gateway 在 init 階段就會綁定，
 * 那時才換 adapter 已經來不及。而 `onModuleInit` 要等到 init 才跑，
 * 若讓 adapter 相依 `RedisService` 的生命週期，就會拿到一個還沒連線的 client。
 *
 * 連線參數集中在此，`RedisService` 與 adapter 共用同一份，避免 REDIS_URL /
 * 密碼 / database 有第二份宣告而遲早不同步。
 *
 * @param onRetry - 每次重試時呼叫，供呼叫端記錄日誌
 */
export const createRedisClient = (
  onRetry?: (retries: number, delayMs: number) => void,
): RedisClientType => {
  const env = getEnv();

  const reconnectStrategy = (retries: number): number | Error => {
    if (retries >= MAX_RETRIES) {
      return new Error('Redis 連線失敗');
    }
    const delay = Math.min(retries * 1000, 10000);
    onRetry?.(retries, delay);
    return delay;
  };

  // 優先使用 REDIS_URL（適用 Redis Cloud、Heroku Redis 等雲端服務）
  return env.REDIS_URL
    ? createClient({
        url: env.REDIS_URL,
        socket: { reconnectStrategy, connectTimeout: CONNECT_TIMEOUT_MS },
        pingInterval: PING_INTERVAL_MS,
      })
    : createClient({
        socket: {
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          reconnectStrategy,
          connectTimeout: CONNECT_TIMEOUT_MS,
        },
        password: env.REDIS_PASSWORD,
        database: env.REDIS_DB,
        pingInterval: PING_INTERVAL_MS,
      });
};
