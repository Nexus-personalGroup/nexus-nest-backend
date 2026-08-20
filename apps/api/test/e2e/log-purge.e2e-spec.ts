import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { PrismaLogPurgeRepository } from '@app/adapter/out/persistence/PrismaLogPurgeRepository';
import { createE2EApp, createMockRedis } from '../setup/test-app';

const daysAgo = (n: number): Date => new Date(Date.now() - n * 86_400_000);

/**
 * 日誌清理的 raw SQL 對真實 MySQL 驗證。
 *
 * 這支是**唯一**會在下列情況亮紅燈的東西：schema 改了 `@map` 讓手寫的 `created_at`
 * 對不上、Prisma 或 adapter 升級改變 `LIMIT` 的參數綁定行為、表名變更。
 * 單元測試 mock 掉 `$executeRaw` 只能守迴圈，守不到 SQL 本身。
 *
 * 失敗是靜默的（排程 try/catch 記 log），所以沒有這支的話，實際後果是
 * 每天凌晨三點失敗一次而沒人發現，直到磁碟滿——正是這個功能要防的事。
 */
describe('日誌保留清理 (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let repo: PrismaLogPurgeRepository;

  beforeAll(async () => {
    ({ app } = await createE2EApp({ redis: createMockRedis() }));
    prisma = app.get(PrismaService);
    repo = new PrismaLogPurgeRepository(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.systemLogRecord.deleteMany();
    await prisma.authLogRecord.deleteMany();
  });

  const seedSystemLog = (createdAt: Date) => ({
    action: 'e2e-purge',
    requestTime: createdAt,
    responseTime: createdAt,
    createdAt,
  });

  it('刪除早於界線的紀錄，保留界線之後的', async () => {
    await prisma.systemLogRecord.createMany({
      data: [seedSystemLog(daysAgo(100)), seedSystemLog(daysAgo(95))],
    });
    await prisma.systemLogRecord.createMany({
      data: [seedSystemLog(daysAgo(10))],
    });
    await prisma.authLogRecord.createMany({
      data: [
        {
          email: 'old@test.com',
          action: 'LOGIN_SUCCESS',
          createdAt: daysAgo(100),
        },
        {
          email: 'new@test.com',
          action: 'LOGIN_SUCCESS',
          createdAt: daysAgo(1),
        },
      ],
    });

    const result = await repo.purgeLogsBefore(daysAgo(90));

    expect(result).toEqual({ systemLogs: 2, authLogs: 1 });
    expect(await prisma.systemLogRecord.count()).toBe(1);
    expect(await prisma.authLogRecord.count()).toBe(1);
  });

  it('沒有可刪的紀錄時回 0，不報錯', async () => {
    await prisma.systemLogRecord.createMany({
      data: [seedSystemLog(daysAgo(1))],
    });

    await expect(repo.purgeLogsBefore(daysAgo(90))).resolves.toEqual({
      systemLogs: 0,
      authLogs: 0,
    });
    expect(await prisma.systemLogRecord.count()).toBe(1);
  });

  // BATCH_SIZE 是 5000，這裡用超過一批的量確認 LIMIT 與迴圈在真 DB 上真的成立
  it('超過單批上限時分多批刪完', async () => {
    const old = daysAgo(100);
    for (let i = 0; i < 6; i += 1) {
      await prisma.systemLogRecord.createMany({
        data: Array.from({ length: 1000 }, () => seedSystemLog(old)),
      });
    }
    await prisma.systemLogRecord.createMany({
      data: [seedSystemLog(daysAgo(1))],
    });

    const result = await repo.purgeLogsBefore(daysAgo(90));

    expect(result.systemLogs).toBe(6000);
    expect(await prisma.systemLogRecord.count()).toBe(1);
  });
});
