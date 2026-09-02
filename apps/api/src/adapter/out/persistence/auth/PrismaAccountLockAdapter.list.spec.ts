import { PrismaAccountLockAdapter } from './PrismaAccountLockAdapter';
import { getEnv } from '@app/infrastructure/validate-env';
import type { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import type { RedisService } from '@app/infrastructure/redis/redis.service';
import type { MetricsPort } from '@app/application/port/out/MetricsPort';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: jest.fn(() => ({ APPLICATION_ACCOUNT_LOCK_DURATION_MIN: 30 })),
}));

const DURATION_MIN = 30;
const NOW = new Date('2026-09-02T12:00:00.000Z');

/** 相對於 NOW 的分鐘數：負數是過去 */
const minutesFromNow = (m: number): Date =>
  new Date(NOW.getTime() + m * 60_000);

const makeAdapter = (records: unknown[]) => {
  const findMany = jest.fn().mockResolvedValue(records);
  const count = jest.fn().mockResolvedValue(records.length);
  const findFirst = jest.fn();
  const prisma = {
    memberRecord: { findMany, count, findFirst },
  } as unknown as PrismaService;
  const redis = { keyPrefix: 'test:', isAvailable: true } as RedisService;
  const metrics = {
    incrementSecurityDegraded: jest.fn(),
  } as unknown as MetricsPort;

  return {
    adapter: new PrismaAccountLockAdapter(prisma, redis, metrics),
    findMany,
    findFirst,
  };
};

const row = (email: string, lockedAt: Date) => ({
  id: `id-${email}`,
  email,
  member: email,
  lockedAt,
  failedLoginCount: 3,
});

describe('PrismaAccountLockAdapter.listLocks', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    jest.mocked(getEnv).mockReturnValue({
      APPLICATION_ACCOUNT_LOCK_DURATION_MIN: DURATION_MIN,
    } as unknown as ReturnType<typeof getEnv>);
  });
  afterEach(() => jest.useRealTimers());

  it('回傳判定後的狀態與自動解鎖時間', async () => {
    const lockedAt = minutesFromNow(-10);
    const { adapter } = makeAdapter([row('a@test.com', lockedAt)]);

    const page = await adapter.listLocks({
      page: 1,
      limit: 10,
      status: 'locked',
    });

    expect(page.list[0]).toMatchObject({
      email: 'a@test.com',
      status: 'locked',
      unlocksAt: new Date(lockedAt.getTime() + DURATION_MIN * 60_000),
    });
  });

  /**
   * ⭐ 到期邊界。
   *
   * 這是與登入路徑一致性的關鍵：`checkLock` 用 `lockedAt > cutoff` 判 LOCKED，
   * 列表必須用**同一個**比較。差一個等號就會出現
   * 「列表說鎖著、但那個人登得進去」——看起來像資料不同步，實際是兩份規則。
   */
  it('⭐ 剛好跨過時效的那一筆判定為 expired，且與 checkLock 一致', async () => {
    // 正好等於 cutoff：checkLock 的 `>` 會判 EXPIRED
    const exactlyExpired = minutesFromNow(-DURATION_MIN);
    const { adapter, findFirst } = makeAdapter([
      row('edge@test.com', exactlyExpired),
    ]);
    findFirst.mockResolvedValue({ lockedAt: exactlyExpired });

    const page = await adapter.listLocks({
      page: 1,
      limit: 10,
      status: 'all',
    });

    expect(page.list[0].status).toBe('expired');
    // 同一筆資料餵給 checkLock 必須得到同樣的結論
    expect(await adapter.checkLock('edge@test.com')).toBe('EXPIRED');
  });

  it('⭐ 差一毫秒還在時效內的那一筆兩邊都判定為鎖定中', async () => {
    const stillLocked = new Date(minutesFromNow(-DURATION_MIN).getTime() + 1);
    const { adapter, findFirst } = makeAdapter([
      row('edge@test.com', stillLocked),
    ]);
    findFirst.mockResolvedValue({ lockedAt: stillLocked });

    const page = await adapter.listLocks({
      page: 1,
      limit: 10,
      status: 'all',
    });

    expect(page.list[0].status).toBe('locked');
    expect(await adapter.checkLock('edge@test.com')).toBe('LOCKED');
  });

  describe('status 過濾條件', () => {
    const whereOf = (findMany: jest.Mock): Record<string, unknown> =>
      (findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;

    it('locked 只查時效內的', async () => {
      const { adapter, findMany } = makeAdapter([]);
      await adapter.listLocks({ page: 1, limit: 10, status: 'locked' });
      expect(whereOf(findMany).lockedAt).toEqual({
        gt: minutesFromNow(-DURATION_MIN),
      });
    });

    it('expired 只查已逾時的', async () => {
      const { adapter, findMany } = makeAdapter([]);
      await adapter.listLocks({ page: 1, limit: 10, status: 'expired' });
      expect(whereOf(findMany).lockedAt).toEqual({
        lte: minutesFromNow(-DURATION_MIN),
      });
    });

    it('all 查所有有鎖定紀錄的', async () => {
      const { adapter, findMany } = makeAdapter([]);
      await adapter.listLocks({ page: 1, limit: 10, status: 'all' });
      expect(whereOf(findMany).lockedAt).toEqual({ not: null });
    });

    it('搜尋為 email 的不分大小寫模糊比對，未提供時不加條件', async () => {
      const { adapter, findMany } = makeAdapter([]);
      await adapter.listLocks({
        page: 1,
        limit: 10,
        status: 'all',
        search: 'GMAIL',
      });
      expect(whereOf(findMany).email).toEqual({
        contains: 'GMAIL',
        mode: 'insensitive',
      });

      const second = makeAdapter([]);
      await second.adapter.listLocks({ page: 1, limit: 10, status: 'all' });
      expect(whereOf(second.findMany).email).toBeUndefined();
    });

    // 軟刪帳號不該出現在任何安全頁面上
    it('一律排除軟刪除的帳號', async () => {
      const { adapter, findMany } = makeAdapter([]);
      await adapter.listLocks({ page: 1, limit: 10, status: 'all' });
      expect(whereOf(findMany).deletedAt).toBeNull();
    });
  });
});
