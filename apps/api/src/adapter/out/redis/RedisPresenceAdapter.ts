import { Injectable, Logger } from '@nestjs/common';
import {
  PresenceConnection,
  PresencePort,
} from '@app/application/port/out/presence/PresencePort';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import {
  buildPresenceKey,
  buildPresenceScanPattern,
} from '@app/infrastructure/redis/cache-keys';
import { getEnv } from '@app/infrastructure/validate-env';

/**
 * 在線狀態的 Redis 實作
 *
 * 結構：`presence:member:{memberId}` 為 Hash，field 是 `{instanceId}:{socketId}`，
 * value 是最後心跳的 epoch ms。
 *
 * **為什麼不是 Set**：Set 的成員沒有各自的時效。實例被 `kill -9` 時來不及執行
 * 斷線清理，它的成員會永久留在 Set 裡——該使用者被永遠顯示為在線，
 * 而且沒有任何機制能自動修正。把心跳時間存在 value 才能過濾掉陳舊的連線。
 */
@Injectable()
export class RedisPresenceAdapter implements PresencePort {
  private readonly logger = new Logger(RedisPresenceAdapter.name);

  constructor(private readonly redis: RedisService) {}

  /** 連線紀錄的存活上限：心跳間隔 × 陳舊倍數。超過即視為該連線已消失 */
  private get staleAfterMs(): number {
    const env = getEnv();
    return env.WS_HEARTBEAT_INTERVAL * env.WS_STALE_MULTIPLIER * 1000;
  }

  /**
   * key 的 TTL 比陳舊門檻再寬一些
   *
   * 兩者若相同，最後一條連線剛好逾時的瞬間整個 key 也會消失，
   * sweep 就再也看不到它、統計不到這次清理。多留一個心跳週期讓 sweep 有機會處理。
   */
  private get keyTtlSeconds(): number {
    return Math.ceil(this.staleAfterMs / 1000) + getEnv().WS_HEARTBEAT_INTERVAL;
  }

  private field(instanceId: string, socketId: string): string {
    return `${instanceId}:${socketId}`;
  }

  async markOnline(
    memberId: string,
    instanceId: string,
    socketId: string,
  ): Promise<boolean> {
    const key = buildPresenceKey(this.redis.keyPrefix, memberId);
    const wasOffline = (await this.getConnections(memberId)).length === 0;
    await this.redis.hashSet(
      key,
      this.field(instanceId, socketId),
      String(Date.now()),
      this.keyTtlSeconds,
    );
    return wasOffline;
  }

  async markOffline(
    memberId: string,
    instanceId: string,
    socketId: string,
  ): Promise<boolean> {
    const key = buildPresenceKey(this.redis.keyPrefix, memberId);
    await this.redis.hashDelete(key, [this.field(instanceId, socketId)]);
    // 用「過濾後的連線數」而非 Redis 回報的欄位數：後者包含尚未被 sweep
    // 清掉的陳舊欄位，會讓已經沒人在線的成員被判定為仍在線
    return (await this.getConnections(memberId)).length === 0;
  }

  async heartbeat(
    memberId: string,
    instanceId: string,
    socketId: string,
  ): Promise<void> {
    const key = buildPresenceKey(this.redis.keyPrefix, memberId);
    // hashSet 同時續期整個 key——只更新 field 不續期的話，
    // 長時間在線的成員反而會因為 key 到期而整批消失
    await this.redis.hashSet(
      key,
      this.field(instanceId, socketId),
      String(Date.now()),
      this.keyTtlSeconds,
    );
  }

  async isOnline(memberId: string): Promise<boolean> {
    return (await this.getConnections(memberId)).length > 0;
  }

  async getConnections(memberId: string): Promise<PresenceConnection[]> {
    const key = buildPresenceKey(this.redis.keyPrefix, memberId);
    const raw = await this.redis.hashGetAll(key);
    return this.parseFresh(raw);
  }

  async sweepStale(): Promise<number> {
    const keys = await this.redis.scanKeys(
      buildPresenceScanPattern(this.redis.keyPrefix),
    );
    let removed = 0;

    for (const key of keys) {
      const raw = await this.redis.hashGetAll(key);
      const stale = Object.entries(raw)
        .filter(([, value]) => this.isStale(value))
        .map(([field]) => field);

      if (stale.length > 0) {
        await this.redis.hashDelete(key, stale);
        removed += stale.length;
      }
    }

    if (removed > 0) {
      this.logger.log(`清除 ${removed} 筆陳舊連線紀錄`);
    }
    return removed;
  }

  /** 判定一筆紀錄是否已陳舊。無法解析的值一律視為陳舊——壞掉的資料不該被當成在線 */
  private isStale(value: string): boolean {
    const lastSeenAt = Number(value);
    if (!Number.isFinite(lastSeenAt)) return true;
    return Date.now() - lastSeenAt > this.staleAfterMs;
  }

  /**
   * 把 Redis 的原始 Hash 轉成未逾時的連線清單
   *
   * @param raw - field → 最後心跳時間字串
   * @returns 仍在時效內的連線
   */
  private parseFresh(raw: Record<string, string>): PresenceConnection[] {
    return Object.entries(raw)
      .filter(([, value]) => !this.isStale(value))
      .map(([field, value]) => {
        // instanceId 是 UUID、socketId 不含冒號，但仍以第一個冒號切分而非 split(':')，
        // 避免日後 socketId 格式改變時靜默取錯
        const separator = field.indexOf(':');
        return {
          instanceId: field.slice(0, separator),
          socketId: field.slice(separator + 1),
          lastSeenAt: Number(value),
        };
      });
  }
}
