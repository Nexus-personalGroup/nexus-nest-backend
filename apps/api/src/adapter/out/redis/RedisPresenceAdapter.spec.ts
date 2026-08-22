import { RedisPresenceAdapter } from './RedisPresenceAdapter';
import { RedisService } from '@app/infrastructure/redis/redis.service';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    WS_HEARTBEAT_INTERVAL: 15,
    WS_STALE_MULTIPLIER: 3,
  }),
}));

const MEMBER = 'member-1';
const INSTANCE_A = 'instance-a';
const INSTANCE_B = 'instance-b';
/** 心跳 15 秒 × 陳舊倍數 3 = 45 秒 */
const STALE_MS = 45_000;

/**
 * 以記憶體 Map 模擬 Redis Hash 與 Set，讓測試驗的是 adapter 的邏輯而非 mock 的回傳值。
 *
 * Set 也用真的集合語意（重複 SADD 不會變成兩份），否則「多裝置只算一個人」
 * 這類斷言會因為 mock 太寬鬆而假性通過。
 */
const makeRedis = () => {
  const store = new Map<string, Map<string, string>>();
  const sets = new Map<string, Set<string>>();

  const redis = {
    keyPrefix: 'nest:',
    setAdd: jest.fn((key: string, members: string[]) => {
      if (!sets.has(key)) sets.set(key, new Set());
      members.forEach((m) => sets.get(key)!.add(m));
      return Promise.resolve();
    }),
    setRemove: jest.fn((key: string, members: string[]) => {
      members.forEach((m) => sets.get(key)?.delete(m));
      return Promise.resolve();
    }),
    setCard: jest.fn((key: string) =>
      Promise.resolve(sets.get(key)?.size ?? 0),
    ),
    setMembers: jest.fn((key: string) =>
      Promise.resolve([...(sets.get(key) ?? [])]),
    ),
    hashSet: jest.fn((key: string, field: string, value: string) => {
      if (!store.has(key)) store.set(key, new Map());
      store.get(key)!.set(field, value);
      return Promise.resolve();
    }),
    hashGetAll: jest.fn((key: string) =>
      Promise.resolve(Object.fromEntries(store.get(key) ?? new Map())),
    ),
    hashDelete: jest.fn((key: string, fields: string[]) => {
      const hash = store.get(key);
      if (!hash) return Promise.resolve(0);
      fields.forEach((f) => hash.delete(f));
      return Promise.resolve(hash.size);
    }),
    scanKeys: jest.fn(() => Promise.resolve(Array.from(store.keys()))),
  };

  return { redis: redis as unknown as RedisService, store, sets };
};

describe('RedisPresenceAdapter', () => {
  let adapter: RedisPresenceAdapter;
  let store: Map<string, Map<string, string>>;
  let sets: Map<string, Set<string>>;
  let redis: RedisService;

  beforeEach(() => {
    jest.useRealTimers();
    const made = makeRedis();
    store = made.store;
    sets = made.sets;
    redis = made.redis;
    adapter = new RedisPresenceAdapter(made.redis);
  });

  describe('多裝置', () => {
    it('第一條連線 → 回報為新上線', async () => {
      await expect(
        adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1'),
      ).resolves.toBe(true);
    });

    it('第二條連線 → 不是新上線', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');

      await expect(
        adapter.markOnline(MEMBER, INSTANCE_A, 'socket-2'),
      ).resolves.toBe(false);
    });

    it('關掉兩條中的一條 → 仍在線', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-2');

      await expect(
        adapter.markOffline(MEMBER, INSTANCE_A, 'socket-1'),
      ).resolves.toBe(false);
      await expect(adapter.isOnline(MEMBER)).resolves.toBe(true);
    });

    it('關掉最後一條 → 真正離線', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');

      await expect(
        adapter.markOffline(MEMBER, INSTANCE_A, 'socket-1'),
      ).resolves.toBe(true);
      await expect(adapter.isOnline(MEMBER)).resolves.toBe(false);
    });

    it('連線分佈在不同實例 → 都算數', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      await adapter.markOnline(MEMBER, INSTANCE_B, 'socket-2');

      const connections = await adapter.getConnections(MEMBER);
      expect(connections.map((c) => c.instanceId).sort()).toEqual([
        INSTANCE_A,
        INSTANCE_B,
      ]);
    });
  });

  // 這組是整個 presence 設計的核心：實例被強制終止時，它留下的紀錄
  // 必須在沒有任何協調機制的情況下自動失效
  describe('實例非正常終止', () => {
    /** 直接把 store 裡的心跳時間改老，模擬「該實例已消失、停止續期」 */
    const ageConnection = (field: string, msAgo: number): void => {
      const key = `nest:presence:member:${MEMBER}`;
      store.get(key)!.set(field, String(Date.now() - msAgo));
    };

    it('超過陳舊門檻的連線不算在線', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      ageConnection(`${INSTANCE_A}:socket-1`, STALE_MS + 1000);

      await expect(adapter.isOnline(MEMBER)).resolves.toBe(false);
    });

    it('尚未超過門檻的連線仍算在線', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      ageConnection(`${INSTANCE_A}:socket-1`, STALE_MS - 5000);

      await expect(adapter.isOnline(MEMBER)).resolves.toBe(true);
    });

    it('一個實例死掉，另一個實例的連線不受影響', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      await adapter.markOnline(MEMBER, INSTANCE_B, 'socket-2');
      ageConnection(`${INSTANCE_A}:socket-1`, STALE_MS + 1000);

      const connections = await adapter.getConnections(MEMBER);
      expect(connections).toHaveLength(1);
      expect(connections[0].instanceId).toBe(INSTANCE_B);
    });

    it('心跳續期後重新算在線', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      ageConnection(`${INSTANCE_A}:socket-1`, STALE_MS + 1000);
      expect(await adapter.isOnline(MEMBER)).toBe(false);

      await adapter.heartbeat(MEMBER, INSTANCE_A, 'socket-1');

      await expect(adapter.isOnline(MEMBER)).resolves.toBe(true);
    });

    it('無法解析的心跳值視為陳舊——壞資料不該被當成在線', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      store
        .get(`nest:presence:member:${MEMBER}`)!
        .set(`${INSTANCE_A}:socket-1`, '不是數字');

      await expect(adapter.isOnline(MEMBER)).resolves.toBe(false);
    });
  });

  describe('sweep', () => {
    it('實際刪除陳舊欄位並回報筆數', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      await adapter.markOnline(MEMBER, INSTANCE_B, 'socket-2');
      const key = `nest:presence:member:${MEMBER}`;
      store
        .get(key)!
        .set(`${INSTANCE_A}:socket-1`, String(Date.now() - 999_999));

      await expect(adapter.sweepStale()).resolves.toBe(1);
      expect(Array.from(store.get(key)!.keys())).toEqual([
        `${INSTANCE_B}:socket-2`,
      ]);
    });

    it('沒有陳舊資料時不動任何東西', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');

      await expect(adapter.sweepStale()).resolves.toBe(0);
    });
  });

  describe('在線人數（衍生索引）', () => {
    it('沒有人在線 → 0', async () => {
      await expect(adapter.countOnlineMembers()).resolves.toBe(0);
    });

    it('上線與下線各自維護索引', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      await expect(adapter.countOnlineMembers()).resolves.toBe(1);

      await adapter.markOffline(MEMBER, INSTANCE_A, 'socket-1');
      await expect(adapter.countOnlineMembers()).resolves.toBe(0);
    });

    /**
     * 計數單位是**人**不是連線。
     *
     * 儀表板問的是「現在有多少人在線上」，而一個人開三個分頁仍然是一個人。
     */
    it('⭐ 同一人多裝置 → 仍算一個人', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      await adapter.markOnline(MEMBER, INSTANCE_B, 'socket-2');

      await expect(adapter.countOnlineMembers()).resolves.toBe(1);
    });

    it('多裝置關掉其中一個 → 仍在線', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      await adapter.markOnline(MEMBER, INSTANCE_B, 'socket-2');

      await adapter.markOffline(MEMBER, INSTANCE_A, 'socket-1');

      await expect(adapter.countOnlineMembers()).resolves.toBe(1);
    });

    /**
     * **查詢成本必須與在線人數無關。**
     *
     * 前一版掃整個 keyspace 再逐一 HGETALL——那是一個「使用者越多越糟」的成本，
     * 而它掛在每 5 秒一次的儀表板推送上。斷言的是**呼叫次數**而非「有被呼叫」：
     * N+1 在小資料量上跑起來完全正常，只有計次抓得到。
     */
    it('⭐ 查詢在線人數不掃 keyspace，只一次 Redis 操作', async () => {
      await adapter.markOnline('m-1', INSTANCE_A, 's-1');
      await adapter.markOnline('m-2', INSTANCE_A, 's-2');
      await adapter.markOnline('m-3', INSTANCE_A, 's-3');
      jest.clearAllMocks();

      await adapter.countOnlineMembers();

      expect(redis.scanKeys).not.toHaveBeenCalled();
      expect(redis.hashGetAll).not.toHaveBeenCalled();
      expect(redis.setCard).toHaveBeenCalledTimes(1);
    });

    // 心跳是所有 presence 操作裡頻率最高的，每次多一個往返會累積
    it('⭐ 心跳不動索引', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      jest.clearAllMocks();

      await adapter.heartbeat(MEMBER, INSTANCE_A, 'socket-1');

      expect(redis.setAdd).not.toHaveBeenCalled();
      expect(redis.setRemove).not.toHaveBeenCalled();
    });
  });

  describe('索引的校正', () => {
    const ONLINE_KEY = 'nest:presence:online-members';

    /**
     * **實例被強制終止時 `markOffline` 不會執行**，索引會單向累積漂移。
     * 這是唯一能把它拉回來的機制。
     */
    it('⭐ 索引有殘留（實例被 kill）→ sweep 後移除', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      // 模擬實例被 kill：連線紀錄隨 TTL 消失，但沒有人呼叫 markOffline
      store.delete(`nest:presence:member:${MEMBER}`);
      expect(sets.get(ONLINE_KEY)!.has(MEMBER)).toBe(true);

      await adapter.sweepStale();

      await expect(adapter.countOnlineMembers()).resolves.toBe(0);
    });

    it('連線全部逾時 → sweep 後索引也移除', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      store
        .get(`nest:presence:member:${MEMBER}`)!
        .set(`${INSTANCE_A}:socket-1`, String(Date.now() - 999_999));

      await adapter.sweepStale();

      await expect(adapter.countOnlineMembers()).resolves.toBe(0);
    });

    it('索引少了在線成員 → sweep 後補上', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      sets.get(ONLINE_KEY)!.delete(MEMBER);

      await adapter.sweepStale();

      await expect(adapter.countOnlineMembers()).resolves.toBe(1);
    });

    // sweep 每個心跳週期都跑，白寫一輪的成本會累積
    it('⭐ 索引已經一致 → 不發出任何寫入', async () => {
      await adapter.markOnline(MEMBER, INSTANCE_A, 'socket-1');
      jest.clearAllMocks();

      await adapter.sweepStale();

      expect(redis.setAdd).not.toHaveBeenCalled();
      expect(redis.setRemove).not.toHaveBeenCalled();
    });

    /**
     * 校正用差集而非整份重建。
     *
     * `DEL` 之後重建有一個窗口讓 `SCARD` 讀到 0——那個瞬間儀表板會顯示
     * 「線上 0 人」，一個看起來像故障的正確操作。
     */
    it('⭐ 校正過程中索引不會變空', async () => {
      await adapter.markOnline('m-1', INSTANCE_A, 's-1');
      await adapter.markOnline('m-2', INSTANCE_A, 's-2');
      sets.get(ONLINE_KEY)!.add('ghost');

      const sizes: number[] = [];
      const originalRemove = redis.setRemove as jest.Mock;
      originalRemove.mockImplementation((key: string, members: string[]) => {
        members.forEach((m) => sets.get(key)?.delete(m));
        sizes.push(sets.get(key)?.size ?? 0);
        return Promise.resolve();
      });

      await adapter.sweepStale();

      // 任何一個中間狀態都不該是 0
      expect(sizes.every((size) => size > 0)).toBe(true);
      await expect(adapter.countOnlineMembers()).resolves.toBe(2);
    });
  });
});
