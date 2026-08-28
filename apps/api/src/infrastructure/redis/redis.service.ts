import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RedisClientType } from 'redis';
import { createRedisClient } from './redis-client.factory';
import { createHash, randomUUID } from 'crypto';
import { getEnv } from '../validate-env';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;
  private _keyPrefix = '';
  private defaultTtl = 0;

  async onModuleInit(): Promise<void> {
    const env = getEnv();
    this._keyPrefix = env.REDIS_KEY_PREFIX;
    this.defaultTtl = env.REDIS_TTL;

    this.client = createRedisClient((retries, delay) =>
      this.logger.warn(
        `Redis 重新連線中 (第 ${retries + 1} 次，延遲 ${delay}ms)`,
      ),
    );

    this.client.on('connect', () => this.logger.log('Redis 連線成功'));
    this.client.on('error', (err) =>
      this.logger.error(
        'Redis 錯誤',
        err instanceof Error ? err.message : String(err),
      ),
    );
    this.client.on('end', () => this.logger.warn('Redis 連線已結束'));

    await this.client.connect().catch((err) => {
      this.logger.error(
        'Redis 初始連線失敗',
        err instanceof Error ? err.message : String(err),
      );
      this.logger.warn('應用程式將在無 Redis 的情況下運行');
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
      this.logger.log('Redis 連線已關閉');
    }
  }

  get isAvailable(): boolean {
    return this.client?.isOpen ?? false;
  }

  /**
   * 主動探測 Redis 是否真正回應（非僅看連線旗標）。
   * 用於 readiness 健康檢查，可偵測 socket 開著但實際無回應的 half-open 狀態。
   * @returns PING 收到 PONG 回 true；連線中斷或無回應回 false
   */
  async ping(): Promise<boolean> {
    if (!this.client?.isOpen) return false;
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  get keyPrefix(): string {
    return this._keyPrefix;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client?.isOpen) return;
    const ttl = ttlSeconds ?? this.defaultTtl;
    if (ttl > 0) {
      await this.client.set(key, value, { EX: ttl });
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client?.isOpen) return null;
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    if (!this.client?.isOpen) return;
    await this.client.del(key);
  }

  /**
   * 一次刪除多個 key
   * @param keys - 要刪除的 key；空陣列直接返回，不送出指令
   */
  async delMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    if (!this.client?.isOpen) return;
    await this.client.del(keys);
  }

  /**
   * 建立一條獨立的 Redis 連線
   *
   * `@socket.io/redis-adapter` 需要 pub 與 sub **兩條各自獨立**的連線——進入
   * subscribe 模式的連線在 Redis 協定上不能再發一般指令，共用會讓廣播與其他操作互相打架。
   *
   * **刻意不複製 `this.client`**：adapter 必須在 `app.init()` 之前取得連線
   * （gateway 在 init 階段就綁定，那時才換 adapter 已經來不及），而 `onModuleInit`
   * 要等到 init 才跑——相依既有連線會拿到一個還沒建立的 client。
   * 連線設定共用 `createRedisClient`，因此仍然只有一份宣告。
   *
   * @param label - 用於日誌辨識這條連線的用途
   * @returns 已連線的 client；呼叫端負責在關閉時 `quit()`
   */
  async createDedicatedClient(label: string): Promise<RedisClientType> {
    const client = createRedisClient();
    client.on('error', (err) =>
      this.logger.error(
        `Redis 錯誤（${label}）`,
        err instanceof Error ? err.message : String(err),
      ),
    );
    await client.connect();
    this.logger.log(`Redis 專用連線已建立（${label}）`);
    return client;
  }

  /**
   * 寫入 Hash 欄位並續期整個 key
   *
   * presence 用它記錄「某成員的某條連線最後心跳時間」。TTL 每次都重設是刻意的：
   * 只寫欄位不續期的話，長時間在線的成員反而會因為 key 到期而整批消失。
   *
   * 與 `set` 的靜默降級不同，Redis 不可用時**拋出**——presence 若能靜默失敗，
   * 呼叫端會拿到「沒有任何人在線」而據此做出錯誤的推播決定。
   */
  async hashSet(
    key: string,
    field: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.client?.isOpen) {
      throw new ServiceUnavailableException('連線狀態服務暫時不可用');
    }
    await this.client.hSet(key, field, value);
    await this.client.expire(key, ttlSeconds);
  }

  /** 取出 Hash 的所有欄位。Redis 不可用時拋出，理由同 `hashSet` */
  async hashGetAll(key: string): Promise<Record<string, string>> {
    if (!this.client?.isOpen) {
      throw new ServiceUnavailableException('連線狀態服務暫時不可用');
    }
    return this.client.hGetAll(key);
  }

  /**
   * 刪除 Hash 的指定欄位
   *
   * @returns 刪除後該 Hash 剩餘的欄位數；用於判斷「這是不是該成員的最後一條連線」
   */
  async hashDelete(key: string, fields: string[]): Promise<number> {
    if (!this.client?.isOpen) {
      throw new ServiceUnavailableException('連線狀態服務暫時不可用');
    }
    if (fields.length === 0) return this.client.hLen(key);
    await this.client.hDel(key, fields);
    return this.client.hLen(key);
  }

  /**
   * 把成員加入 Set
   *
   * Redis 不可用時**拋出**，理由同 `hashSet`：presence 相關的操作靜默失敗，
   * 會讓呼叫端拿到一個看起來正常的錯誤答案。
   */
  async setAdd(key: string, members: string[]): Promise<void> {
    if (!this.client?.isOpen) {
      throw new ServiceUnavailableException('連線狀態服務暫時不可用');
    }
    if (members.length === 0) return;
    await this.client.sAdd(key, members);
  }

  /** 從 Set 移除成員。Redis 不可用時拋出，理由同 `setAdd` */
  async setRemove(key: string, members: string[]): Promise<void> {
    if (!this.client?.isOpen) {
      throw new ServiceUnavailableException('連線狀態服務暫時不可用');
    }
    if (members.length === 0) return;
    await this.client.sRem(key, members);
  }

  /** Set 的基數。O(1)，與集合大小無關 */
  async setCard(key: string): Promise<number> {
    if (!this.client?.isOpen) {
      throw new ServiceUnavailableException('連線狀態服務暫時不可用');
    }
    return this.client.sCard(key);
  }

  /** Set 的所有成員。僅供校正用——它的成本與集合大小成正比 */
  async setMembers(key: string): Promise<string[]> {
    if (!this.client?.isOpen) {
      throw new ServiceUnavailableException('連線狀態服務暫時不可用');
    }
    return this.client.sMembers(key);
  }

  /**
   * 掃描符合 pattern 的 key
   *
   * 用 SCAN 而非 KEYS：後者在 key 數量大時會阻塞整個 Redis 行程。
   * 僅供排程的 sweep 使用，**不可用於請求路徑**。
   */
  async scanKeys(pattern: string, batchSize = 100): Promise<string[]> {
    if (!this.client?.isOpen) {
      throw new ServiceUnavailableException('連線狀態服務暫時不可用');
    }
    const found: string[] = [];
    for await (const keys of this.client.scanIterator({
      MATCH: pattern,
      COUNT: batchSize,
    })) {
      found.push(...(Array.isArray(keys) ? keys : [keys]));
    }
    return found;
  }

  /**
   * 原子性 INCR + 首次 TTL 設定。
   * Redis 不可用時 graceful degradation，回傳 0。
   */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (!this.client?.isOpen) return 0;
    try {
      const count = await this.client.incr(key);
      // 僅首次（count === 1）設定 TTL
      if (count === 1) {
        await this.client.expire(key, ttlSeconds);
      }
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * 將 token 加入黑名單，值存入「進黑名單的原因」。
   *
   * 原因是必要的：`refresh 輪替後的舊 token 又被使用` 是遭竊訊號、要撤銷全部 session，
   * 而 `使用者登出的 token 又被使用` 只是併發請求撞上登出，只該拒絕本次。
   * 兩者若不分，正常登出會連坐踢掉使用者所有裝置。
   *
   * @param token - 要加入黑名單的 token
   * @param ttlSeconds - 存活秒數，配合 JWT 剩餘效期
   * @param reason - 進黑名單的原因
   */
  async addToBlacklist(
    token: string,
    ttlSeconds: number,
    reason: string,
  ): Promise<void> {
    const hash = createHash('sha256').update(token).digest('hex').slice(0, 32);
    await this.set(`${this._keyPrefix}blacklist:${hash}`, reason, ttlSeconds);
  }

  /**
   * 取出 token 進黑名單的原因
   * @param token - 要查詢的 token
   * @returns 原因字串；不在黑名單時為 null
   */
  async getBlacklistReason(token: string): Promise<string | null> {
    if (!this.client?.isOpen) {
      throw new ServiceUnavailableException('認證服務暫時不可用，請稍後再試');
    }
    const hash = createHash('sha256').update(token).digest('hex').slice(0, 32);
    return this.get(`${this._keyPrefix}blacklist:${hash}`);
  }

  /**
   * 檢查 Token 是否在黑名單中。
   * Redis 不可用時採 fail-closed 策略：拋出 503，避免已登出的 token 繼續使用。
   * 與 Throttler 的靜默降級不同，安全功能不允許靜默關閉。
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    if (!this.client?.isOpen) {
      throw new ServiceUnavailableException('認證服務暫時不可用，請稍後再試');
    }
    const hash = createHash('sha256').update(token).digest('hex').slice(0, 32);
    const result = await this.get(`${this._keyPrefix}blacklist:${hash}`);
    return result !== null;
  }

  /**
   * 原子性滑動視窗計數（Lua Script via EVAL）。
   * 用於 ThrottlerStorage，避免 GET+SET 競態條件。
   *
   * **Redis 不可用時預設 fail-closed**（回極大值 → `isBlocked` 為真 → 429）。
   * 回 `0` 等於告訴 ThrottlerGuard「這個來源本視窗一次都沒請求過」，全站速率限制
   * 同時歸零，包含登入與 forgot-password——暴力破解防護在最需要的時候消失。
   * 要換成可用性優先就設 `THROTTLE_FAIL_OPEN=true`，代價是知情的。
   */
  async throttleIncrement(key: string, ttlMs: number): Promise<number> {
    if (!this.client?.isOpen) {
      if (getEnv().THROTTLE_FAIL_OPEN) {
        // 「防護關閉」不是 warn 等級的事件，但這是部署方明示選擇的行為
        this.logger.error('[Throttle] Redis 不可用，依設定放行（保護已停用）');
        return 0;
      }
      this.logger.error('[Throttle] Redis 不可用，改採保守策略拒絕請求');
      return Number.MAX_SAFE_INTEGER;
    }
    const now = Date.now();
    const script = [
      'local key = KEYS[1]',
      'local now = tonumber(ARGV[1])',
      'local window = tonumber(ARGV[2])',
      'redis.call("ZREMRANGEBYSCORE", key, "-inf", now - window)',
      // member 必須唯一：ZADD 對既有 member 只更新 score、不新增元素，
      // 用時間戳當 member 會讓同毫秒抵達的請求全部併成一筆，計數系統性低估
      'redis.call("ZADD", key, now, ARGV[3])',
      'redis.call("PEXPIRE", key, window)',
      'return redis.call("ZCARD", key)',
    ].join('\n');
    const count = await this.client.eval(script, {
      keys: [key],
      arguments: [String(now), String(ttlMs), `${now}-${randomUUID()}`],
    });
    return Number(count);
  }
}
