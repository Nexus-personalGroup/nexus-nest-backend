import { Logger } from '@nestjs/common';
import { PrismaAccountLockAdapter } from './PrismaAccountLockAdapter';
import { getEnv } from '@app/infrastructure/validate-env';
import type { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import type { RedisService } from '@app/infrastructure/redis/redis.service';
import type { MetricsPort } from '@app/application/port/out/MetricsPort';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: jest.fn(),
}));

const mockGetEnv = jest.mocked(getEnv);

const EMAIL = 'admin@test.com';

describe('PrismaAccountLockAdapter.checkLock', () => {
  let findFirst: jest.Mock;
  let updateMany: jest.Mock;
  let adapter: PrismaAccountLockAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks 不會還原 mockReturnValue，每支測試都要重設
    mockGetEnv.mockReturnValue({
      APPLICATION_ACCOUNT_LOCK_DURATION_MIN: 15,
    } as unknown as ReturnType<typeof getEnv>);

    findFirst = jest.fn();
    updateMany = jest.fn();
    const prisma = {
      memberRecord: { findFirst, updateMany },
    } as unknown as PrismaService;
    const redis = {
      keyPrefix: 'nest:',
      isAvailable: true,
      del: jest.fn(),
      increment: jest.fn(),
    } as unknown as RedisService;

    const metrics = {
      incrementSecurityDegraded: jest.fn(),
    } as unknown as MetricsPort;

    adapter = new PrismaAccountLockAdapter(prisma, redis, metrics);
  });

  it('從未鎖定 → NONE', async () => {
    findFirst.mockResolvedValue({ lockedAt: null });

    expect(await adapter.checkLock(EMAIL)).toBe('NONE');
  });

  it('帳號不存在 → NONE', async () => {
    findFirst.mockResolvedValue(null);

    expect(await adapter.checkLock(EMAIL)).toBe('NONE');
  });

  it('鎖定後未逾時效 → LOCKED', async () => {
    findFirst.mockResolvedValue({ lockedAt: new Date(Date.now() - 60_000) });

    expect(await adapter.checkLock(EMAIL)).toBe('LOCKED');
  });

  /**
   * 沒有時效的鎖定是一個**沒有復原路徑**的死結：鎖定的檢查排在密碼驗證之前，
   * 被鎖的帳號連「密碼打對」都到不了清除計數那條路，而人工解鎖需要一個
   * 已登入的 SUPERADMIN——把管理員全鎖一輪就沒有人能登入解鎖。
   */
  it('⭐ 鎖定已逾時效 → EXPIRED', async () => {
    findFirst.mockResolvedValue({
      lockedAt: new Date(Date.now() - 16 * 60_000),
    });

    expect(await adapter.checkLock(EMAIL)).toBe('EXPIRED');
  });

  it('時效長度來自環境變數，不寫死', async () => {
    mockGetEnv.mockReturnValue({
      APPLICATION_ACCOUNT_LOCK_DURATION_MIN: 60,
    } as unknown as ReturnType<typeof getEnv>);
    findFirst.mockResolvedValue({
      lockedAt: new Date(Date.now() - 16 * 60_000),
    });

    // 同一個時間點，時效 15 分鐘時是 EXPIRED，60 分鐘時仍在鎖定中
    expect(await adapter.checkLock(EMAIL)).toBe('LOCKED');
  });

  /**
   * **查詢方法不得有副作用。**
   *
   * 到期時該做的清理由呼叫端負責——一個叫 `checkLock` 的方法偷偷做寫入，
   * 是下一個人絕對不會預期的事，而它會在「只是查一下狀態」的地方改到資料。
   */
  it('⭐ 即使已到期也不寫入任何東西', async () => {
    findFirst.mockResolvedValue({
      lockedAt: new Date(Date.now() - 16 * 60_000),
    });

    await adapter.checkLock(EMAIL);

    expect(updateMany).not.toHaveBeenCalled();
  });

  // 軟刪的帳號不該被當成存在
  it('查詢帶 deletedAt: null', async () => {
    findFirst.mockResolvedValue({ lockedAt: null });

    await adapter.checkLock(EMAIL);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: EMAIL, deletedAt: null },
      }),
    );
  });
});

/**
 * Redis 不可用時的降級。
 *
 * **放行是刻意的**——擋下來等於把快取故障升級成全站故障。
 * 這組測試守的不是「該不該放行」，是**放行有沒有留下痕跡**：
 * 沒有痕跡的話，Redis 掛掉的期間可以無限次猜密碼，
 * 而事後翻日誌看不出那段時間防護是失效的。
 */
describe('PrismaAccountLockAdapter.recordFailedLogin 的降級', () => {
  const makeAdapter = (isAvailable: boolean) => {
    const updateMany = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      memberRecord: { updateMany },
    } as unknown as PrismaService;
    const increment = jest.fn().mockResolvedValue(3);
    const redis = {
      keyPrefix: 'nest:',
      isAvailable,
      del: jest.fn(),
      increment,
    } as unknown as RedisService;
    const metrics = {
      incrementSecurityDegraded: jest.fn(),
    } as unknown as jest.Mocked<MetricsPort>;
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    return {
      adapter: new PrismaAccountLockAdapter(prisma, redis, metrics),
      metrics,
      warn,
      increment,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('⭐ Redis 不可用 → 有警告、指標 +1，且仍然放行', async () => {
    const { adapter, metrics, warn, increment } = makeAdapter(false);

    const count = await adapter.recordFailedLogin(EMAIL);

    expect(warn).toHaveBeenCalled();
    expect(metrics.incrementSecurityDegraded).toHaveBeenCalledWith(
      'account-lock',
    );
    // 放行行為不變：回 0 讓門檻永遠不成立，登入流程不被阻塞
    expect(count).toBe(0);
    expect(increment).not.toHaveBeenCalled();
  });

  it('Redis 可用 → 沒有警告、指標不動', async () => {
    const { adapter, metrics, warn } = makeAdapter(true);

    const count = await adapter.recordFailedLogin(EMAIL);

    expect(warn).not.toHaveBeenCalled();
    expect(metrics.incrementSecurityDegraded).not.toHaveBeenCalled();
    expect(count).toBe(3);
  });
});
