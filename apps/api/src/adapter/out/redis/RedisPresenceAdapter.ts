import { Injectable, Logger } from '@nestjs/common';
import {
  PresenceConnection,
  PresencePort,
  PresenceRenewal,
} from '@app/application/port/out/presence/PresencePort';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import {
  buildOnlineMembersKey,
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

  /** 在線成員索引的 key */
  private get onlineKey(): string {
    return buildOnlineMembersKey(this.redis.keyPrefix);
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
    // 只在狀態真正轉換時動索引：`wasOffline` 本來就已經算出來了。
    // 多裝置的第二、第三條連線不需要重複 SADD
    if (wasOffline) {
      await this.redis.setAdd(this.onlineKey, [memberId]);
    }
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
    const nowOffline = (await this.getConnections(memberId)).length === 0;
    if (nowOffline) {
      await this.redis.setRemove(this.onlineKey, [memberId]);
    }
    return nowOffline;
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

  async heartbeatMany(entries: PresenceRenewal[]): Promise<void> {
    if (entries.length === 0) return;
    const ttl = this.keyTtlSeconds;
    const now = String(Date.now());
    await this.redis.hashSetMany(
      entries.map(({ memberId, instanceId, socketId }) => ({
        key: buildPresenceKey(this.redis.keyPrefix, memberId),
        field: this.field(instanceId, socketId),
        value: now,
        ttlSeconds: ttl,
      })),
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

  /**
   * 目前在線的成員數。
   *
   * 讀衍生索引的 `SCARD`，**O(1)**。前一版掃整個 keyspace 再逐一 HGETALL——
   * 那是一個「使用者越多越糟」的成本，而它掛在每 5 秒一次的儀表板推送上。
   *
   * 這個數字有校正延遲（實例被強制終止到下一次 sweep 之間），
   * **只能用於統計**。需要精確判斷的地方請用 `isOnline()`，它讀的是連線紀錄。
   */
  async countOnlineMembers(): Promise<number> {
    return this.redis.setCard(this.onlineKey);
  }

  async sweepStale(): Promise<number> {
    const keys = await this.redis.scanKeys(
      buildPresenceScanPattern(this.redis.keyPrefix),
    );
    let removed = 0;
    // 遍歷過程中順手記下「還有未逾時連線的成員」——那就是索引的真值。
    // 這是校正唯一不需要額外掃描的時機
    const stillOnline = new Set<string>();

    for (const key of keys) {
      const raw = await this.redis.hashGetAll(key);
      const stale = Object.entries(raw)
        .filter(([, value]) => this.isStale(value))
        .map(([field]) => field);

      if (stale.length > 0) {
        await this.redis.hashDelete(key, stale);
        removed += stale.length;
      }

      if (Object.entries(raw).some(([, value]) => !this.isStale(value))) {
        stillOnline.add(this.memberIdOf(key));
      }
    }

    await this.reconcileOnlineIndex(stillOnline);

    if (removed > 0) {
      this.logger.log(`清除 ${removed} 筆陳舊連線紀錄`);
    }
    return removed;
  }

  /**
   * 以差集校正在線成員索引。
   *
   * 需要校正是因為**實例被強制終止時 `markOffline` 不會執行**，
   * 索引會單向累積漂移（只多不少）。
   *
   * **用差集而非整份重建。** `DEL` 之後重建有一個窗口讓 `SCARD` 讀到 0，
   * 而那個瞬間儀表板會顯示「線上 0 人」——一個看起來像故障的正確操作。
   *
   * 一致時完全不發出寫入：sweep 每個心跳週期都跑，白寫一輪的成本會累積。
   *
   * @param stillOnline - 掃描得出的真值：仍有未逾時連線的成員
   */
  private async reconcileOnlineIndex(stillOnline: Set<string>): Promise<void> {
    const indexed = new Set(await this.redis.setMembers(this.onlineKey));

    const gone = [...indexed].filter((id) => !stillOnline.has(id));
    const missing = [...stillOnline].filter((id) => !indexed.has(id));

    if (gone.length > 0) {
      await this.redis.setRemove(this.onlineKey, gone);
    }
    if (missing.length > 0) {
      await this.redis.setAdd(this.onlineKey, missing);
    }
    if (gone.length > 0 || missing.length > 0) {
      this.logger.log(
        `校正在線索引：移除 ${gone.length}、補上 ${missing.length}`,
      );
    }
  }

  /** 由 presence key 取回 memberId；key 的形狀是 `<prefix>presence:member:<id>` */
  private memberIdOf(key: string): string {
    return key.slice(key.lastIndexOf(':') + 1);
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
