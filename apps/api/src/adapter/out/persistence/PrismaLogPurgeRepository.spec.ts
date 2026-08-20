import { PrismaLogPurgeRepository } from './PrismaLogPurgeRepository';
import type { PrismaService } from '@app/infrastructure/prisma/prisma.service';

/**
 * 這支 repository 把 Prisma 型別檢查過的 `deleteMany` 換成手寫 raw SQL，
 * 換來分批刪除，也換掉了型別保護——欄位名 `created_at` 是字串，schema 改 `@map`
 * 不會有任何警告。而失敗是**靜默的**（排程 try/catch 記 log），後果是
 * 「每天凌晨三點失敗一次、日誌無界成長、沒人發現」，正是這個功能要防的事。
 *
 * 這裡守迴圈邏輯；SQL 本身的有效性由 e2e 對真 DB 驗證（見 log-purge.e2e-spec.ts）。
 */
describe('PrismaLogPurgeRepository', () => {
  const makeRepo = (counts: number[]) => {
    const executeRaw = jest.fn();
    counts.forEach((c) => executeRaw.mockResolvedValueOnce(c));
    executeRaw.mockResolvedValue(0);
    const prisma = { $executeRaw: executeRaw } as unknown as PrismaService;
    return { repo: new PrismaLogPurgeRepository(prisma), executeRaw };
  };

  it('刪滿一批就繼續，不滿一批即停止', async () => {
    // system_logs 兩批（5000 + 1200）、auth_logs 一批（3 筆）
    const { repo, executeRaw } = makeRepo([5000, 1200, 3]);

    const result = await repo.purgeLogsBefore(new Date());

    expect(result.systemLogs).toBe(6200);
    expect(result.authLogs).toBe(3);
    expect(executeRaw).toHaveBeenCalledTimes(3);
  });

  it('第一批就不滿即停止，不做多餘往返', async () => {
    const { repo, executeRaw } = makeRepo([0, 0]);

    const result = await repo.purgeLogsBefore(new Date());

    expect(result).toEqual({ systemLogs: 0, authLogs: 0 });
    // 兩張表各一次即結束
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it('cutoff 原樣帶入查詢，不做任何轉換', async () => {
    const { repo, executeRaw } = makeRepo([0, 0]);
    const cutoff = new Date('2026-01-01T00:00:00.000Z');

    await repo.purgeLogsBefore(cutoff);

    // tagged template：第二個參數起是內插值，cutoff 應原樣出現
    expect(executeRaw.mock.calls[0]).toContain(cutoff);
  });
});
