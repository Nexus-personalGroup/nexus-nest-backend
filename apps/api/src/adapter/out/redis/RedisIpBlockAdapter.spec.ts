import { Logger } from '@nestjs/common';
import { RedisIpBlockAdapter } from './RedisIpBlockAdapter';
import type { RedisService } from '../../../infrastructure/redis/redis.service';
import type { MetricsPort } from '../../../application/port/out/MetricsPort';

const IP = '203.0.113.7';

/**
 * Redis 不可用時的降級。
 *
 * 與 `PrismaAccountLockAdapter` 是同一個模式、同一個判準：
 * **放行是刻意的，但放行必須留下痕跡**。
 *
 * 兩條路徑要分別驗——只補其中一條的話，另一條依然是靜默的，
 * 而「帳號鎖定有記錄、IP 黑名單沒有」比兩條都沒有更難察覺。
 */
describe('RedisIpBlockAdapter.recordFailedIpAttempt 的降級', () => {
  const makeAdapter = (isAvailable: boolean) => {
    const increment = jest.fn().mockResolvedValue(5);
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
      adapter: new RedisIpBlockAdapter(redis, metrics),
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

    const count = await adapter.recordFailedIpAttempt(IP);

    expect(warn).toHaveBeenCalled();
    expect(metrics.incrementSecurityDegraded).toHaveBeenCalledWith('ip-block');
    // 放行行為不變：回 0 讓門檻永遠不成立
    expect(count).toBe(0);
    expect(increment).not.toHaveBeenCalled();
  });

  it('Redis 可用 → 沒有警告、指標不動', async () => {
    const { adapter, metrics, warn } = makeAdapter(true);

    const count = await adapter.recordFailedIpAttempt(IP);

    expect(warn).not.toHaveBeenCalled();
    expect(metrics.incrementSecurityDegraded).not.toHaveBeenCalled();
    expect(count).toBe(5);
  });

  // 指標的標籤要分得開：只有一邊在降級是有意義的資訊
  it('標籤用 ip-block，不與 account-lock 混用', async () => {
    const { adapter, metrics } = makeAdapter(false);

    await adapter.recordFailedIpAttempt(IP);

    expect(metrics.incrementSecurityDegraded).not.toHaveBeenCalledWith(
      'account-lock',
    );
  });
});
