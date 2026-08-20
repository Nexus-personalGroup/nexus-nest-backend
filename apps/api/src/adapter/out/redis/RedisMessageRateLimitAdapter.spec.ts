import { RedisMessageRateLimitAdapter } from './RedisMessageRateLimitAdapter';
import { getEnv } from '@app/infrastructure/validate-env';
import type { RedisService } from '@app/infrastructure/redis/redis.service';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: jest.fn(),
}));

const mockGetEnv = jest.mocked(getEnv);

describe('RedisMessageRateLimitAdapter', () => {
  let throttleIncrement: jest.Mock;
  let adapter: RedisMessageRateLimitAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks 不會還原 mockReturnValue，每支測試都要重設
    mockGetEnv.mockReturnValue({
      WS_MESSAGE_RATE_LIMIT: 3,
      WS_MESSAGE_RATE_WINDOW_SEC: 10,
    } as unknown as ReturnType<typeof getEnv>);
    throttleIncrement = jest.fn().mockResolvedValue(1);
    adapter = new RedisMessageRateLimitAdapter({
      throttleIncrement,
    } as unknown as RedisService);
  });

  it('未達閾值時放行', async () => {
    throttleIncrement.mockResolvedValue(3);
    expect(await adapter.hitAndCheck('me', 'room-1')).toBe(false);
  });

  it('超過閾值時擋下', async () => {
    throttleIncrement.mockResolvedValue(4);
    expect(await adapter.hitAndCheck('me', 'room-1')).toBe(true);
  });

  // 計數以「成員 + 房間」為單位：同一個人在多個房間發言是正常行為，
  // 用單一計數器會讓活躍使用者被自己的正常使用擋下
  it('計數鍵同時含成員與房間', async () => {
    await adapter.hitAndCheck('me', 'room-1');
    expect(throttleIncrement).toHaveBeenCalledWith(
      expect.stringContaining('me'),
      expect.any(Number),
    );
    expect(throttleIncrement).toHaveBeenCalledWith(
      expect.stringContaining('room-1'),
      expect.any(Number),
    );
  });

  it('視窗以毫秒傳入', async () => {
    await adapter.hitAndCheck('me', 'room-1');
    expect(throttleIncrement).toHaveBeenCalledWith(expect.any(String), 10_000);
  });

  // 每次讀取而非建構時快取：閾值調整後不必重啟，測試覆寫也才有效
  it('閾值每次呼叫都重新讀取', async () => {
    await adapter.hitAndCheck('me', 'room-1');
    await adapter.hitAndCheck('me', 'room-1');
    expect(mockGetEnv).toHaveBeenCalledTimes(2);
  });

  // throttleIncrement 在 Redis 不可用時回極大值（fail-closed），
  // 這裡不得把它當成正常計數而放行
  it('Redis 不可用回極大值時擋下', async () => {
    throttleIncrement.mockResolvedValue(Number.MAX_SAFE_INTEGER);
    expect(await adapter.hitAndCheck('me', 'room-1')).toBe(true);
  });
});
