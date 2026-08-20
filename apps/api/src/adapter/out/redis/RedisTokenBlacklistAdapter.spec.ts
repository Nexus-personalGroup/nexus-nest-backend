import { RedisTokenBlacklistAdapter } from './RedisTokenBlacklistAdapter';
import type { RedisService } from '@app/infrastructure/redis/redis.service';

/**
 * 這支 adapter 平常不在覆蓋率分母內（`/adapter/out/` 被排除），但它負責把 Redis 的
 * 原始字串翻譯成 port 的語意——**翻譯錯了就是安全漏洞，而且上層邏輯再正確也救不回來**。
 *
 * 實際發生過：改用 reason 之後，舊格式的值（`'1'`）被壓成 `null`，
 * 與「不在黑名單」無法區分，`RefreshTokenService` 因此連 throw 都跳過，
 * 部署當下所有既存的已登出 / 已輪替 refresh token 在剩餘 TTL 內全部復活。
 */
describe('RedisTokenBlacklistAdapter', () => {
  const makeAdapter = (stored: string | null) => {
    const redis = {
      getBlacklistReason: jest.fn().mockResolvedValue(stored),
      addToBlacklist: jest.fn(),
      isTokenBlacklisted: jest.fn(),
      del: jest.fn(),
    } as unknown as RedisService;
    return new RedisTokenBlacklistAdapter(redis);
  };

  describe('getBlacklistReason', () => {
    it('不在黑名單 → null', async () => {
      await expect(
        makeAdapter(null).getBlacklistReason('t'),
      ).resolves.toBeNull();
    });

    it.each(['rotated', 'logout'] as const)(
      '已知原因原樣回傳：%s',
      async (v) => {
        await expect(makeAdapter(v).getBlacklistReason('t')).resolves.toBe(v);
      },
    );

    // 關鍵案例：在黑名單、但值無法辨識。**不可回 null**——
    // null 的語意是「不在黑名單」，會讓呼叫端放行。
    it.each(['1', '', 'something-else'])(
      '在黑名單但原因不明（舊格式 %p）→ unknown，不可為 null',
      async (stored) => {
        const result = await makeAdapter(stored).getBlacklistReason('t');
        expect(result).toBe('unknown');
        expect(result).not.toBeNull();
      },
    );
  });
});
