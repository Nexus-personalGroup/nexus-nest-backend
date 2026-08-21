import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { ChatRetentionService } from '@app/application/service/shared/ChatRetentionService';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';

const PASSWORD = 'TestPass123!';
const DAY_MS = 86_400_000;

/** 相對於現在的日期，讓測試不依賴固定時刻 */
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

describe('ChatRetention E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let retention: ChatRetentionService;
  const mockRedis = createMockRedis();

  let memberId = '';
  let roomId = '';
  let messageId = '';

  beforeAll(async () => {
    ({ app } = await createE2EApp({ redis: mockRedis }));
    prisma = app.get(PrismaService);
    retention = app.get(ChatRetentionService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await resetDb(prisma);

    const member = await seedMember(prisma, {
      email: 'a@test.com',
      password: PASSWORD,
    });
    memberId = member.memberId;

    const room = await prisma.chatRoomRecord.create({
      data: { roomType: 'GROUP', name: '保留測試房間', lastSeq: 1 },
    });
    roomId = room.id;

    const message = await prisma.chatMessageRecord.create({
      data: {
        roomId,
        senderId: memberId,
        content: '很舊的訊息',
        seq: 1,
        clientMessageId: 'c-1',
        createdAt: daysAgo(1000),
      },
    });
    messageId = message.id;
  });

  describe('稽核紀錄', () => {
    it('逾期的被刪除，未逾期的留著', async () => {
      await prisma.chatAuditLogRecord.createMany({
        data: [
          { memberId, action: 'ROOM_LEFT', createdAt: daysAgo(200) },
          { memberId, action: 'ROOM_JOINED', createdAt: daysAgo(10) },
        ],
      });

      const result = await retention.purge(180, 365);

      expect(result.auditLogs).toBe(1);
      const remaining = await prisma.chatAuditLogRecord.findMany();
      expect(remaining.map((r) => r.action)).toEqual(['ROOM_JOINED']);
    });

    it('沒有逾期資料時不刪任何東西', async () => {
      await prisma.chatAuditLogRecord.create({
        data: { memberId, action: 'ROOM_JOINED', createdAt: daysAgo(1) },
      });

      const result = await retention.purge(180, 365);

      expect(result.auditLogs).toBe(0);
      expect(await prisma.chatAuditLogRecord.count()).toBe(1);
    });
  });

  describe('檢舉', () => {
    const seedReport = async (opts: {
      clientId: string;
      status: 'PENDING' | 'REVIEWED' | 'DISMISSED';
      createdAt: Date;
      reviewedAt?: Date;
    }): Promise<string> => {
      const report = await prisma.chatReportRecord.create({
        data: {
          reporterId: memberId,
          targetMessageId: messageId,
          targetMemberId: memberId,
          roomId,
          reason: 'HARASSMENT',
          contentSnapshot: `快照-${opts.clientId}`,
          status: opts.status,
          createdAt: opts.createdAt,
          reviewedAt: opts.reviewedAt ?? null,
        },
      });
      return report.id;
    };

    // 按建立時間清會讓積壓的佇列靜默地把證據刪掉，
    // 而積壓正是最需要那些證據的時候
    it('⭐ 未判定的檢舉即使很舊也不刪', async () => {
      await seedReport({
        clientId: 'old-pending',
        status: 'PENDING',
        createdAt: daysAgo(1000),
      });

      const result = await retention.purge(180, 365);

      expect(result.reports).toBe(0);
      expect(await prisma.chatReportRecord.count()).toBe(1);
    });

    it('⭐ 已判定且逾期 → 刪除，連同內容快照', async () => {
      await seedReport({
        clientId: 'old-reviewed',
        status: 'REVIEWED',
        createdAt: daysAgo(1000),
        reviewedAt: daysAgo(400),
      });

      const result = await retention.purge(180, 365);

      expect(result.reports).toBe(1);
      expect(await prisma.chatReportRecord.count()).toBe(0);
    });

    it('已判定但未逾期 → 不刪', async () => {
      await seedReport({
        clientId: 'recent-reviewed',
        status: 'REVIEWED',
        createdAt: daysAgo(1000),
        reviewedAt: daysAgo(10),
      });

      const result = await retention.purge(180, 365);

      expect(result.reports).toBe(0);
      expect(await prisma.chatReportRecord.count()).toBe(1);
    });

    it('DISMISSED 與 REVIEWED 一視同仁', async () => {
      await seedReport({
        clientId: 'old-dismissed',
        status: 'DISMISSED',
        createdAt: daysAgo(1000),
        reviewedAt: daysAgo(400),
      });

      const result = await retention.purge(180, 365);

      expect(result.reports).toBe(1);
    });
  });

  /**
   * 訊息不清理——本 change 最重要的決定。
   *
   * 清理訊息會讓 `seq` 重新出現洞，而補齊的客戶端無法區分「被清掉」與「我漏收了」。
   */
  describe('訊息', () => {
    it('⭐ 清理後訊息筆數不變，即使它非常舊', async () => {
      await prisma.chatAuditLogRecord.create({
        data: { memberId, action: 'ROOM_LEFT', createdAt: daysAgo(1000) },
      });

      await retention.purge(180, 365);

      // 訊息的 createdAt 是 1000 天前，遠超任何保留天數
      expect(await prisma.chatMessageRecord.count()).toBe(1);
      const message = await prisma.chatMessageRecord.findUniqueOrThrow({
        where: { id: messageId },
      });
      expect(message.content).toBe('很舊的訊息');
    });

    it('房間與成員關係也不清理', async () => {
      await retention.purge(180, 365);

      expect(await prisma.chatRoomRecord.count()).toBe(1);
    });
  });
});
