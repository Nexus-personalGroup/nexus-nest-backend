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

/** 以記憶體 Map 模擬 Redis Hash，讓測試驗的是 adapter 的邏輯而非 mock 的回傳值 */
const makeRedis = () => {
  const store = new Map<string, Map<string, string>>();

  const redis = {
    keyPrefix: 'nest:',
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

  return { redis: redis as unknown as RedisService, store };
};

describe('RedisPresenceAdapter', () => {
  let adapter: RedisPresenceAdapter;
  let store: Map<string, Map<string, string>>;

  beforeEach(() => {
    jest.useRealTimers();
    const made = makeRedis();
    store = made.store;
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
});
