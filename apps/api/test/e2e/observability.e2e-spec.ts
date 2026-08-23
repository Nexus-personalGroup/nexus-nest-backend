import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { METRIC_NAMES } from '@app/adapter/out/metrics/PrometheusMetricsAdapter';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedUser } from '../helpers/db';

const PASSWORD = 'TestPass123!';

describe('Observability E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

  let token = '';
  let idA = '';
  let idB = '';
  let roomId = '';

  beforeAll(async () => {
    ({ app } = await createE2EApp({ redis: mockRedis }));
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.isTokenBlacklisted.mockResolvedValue(false);
    mockRedis.throttleIncrement.mockResolvedValue(1);
    await resetDb(prisma);

    const a = await seedUser(prisma, {
      email: 'a@test.com',
      password: PASSWORD,
    });
    const b = await seedUser(prisma, {
      email: 'b@test.com',
      password: PASSWORD,
    });
    idA = a.userId;
    idB = b.userId;

    const res = await request(app.getHttpServer())
      .post('/api/front/auth/login')
      .send({ email: 'a@test.com', password: PASSWORD });
    token = (res.body as { data: { accessToken: string } }).data.accessToken;

    const room = await prisma.chatRoomRecord.create({
      data: {
        roomType: 'GROUP',
        name: '稽核測試房間',
        members: { create: [{ memberId: idA }, { memberId: idB }] },
      },
    });
    roomId = room.id;
  });

  describe('指標端點', () => {
    it('曝露自訂指標的名稱', async () => {
      const res = await request(app.getHttpServer()).get('/api/metrics');

      expect(res.status).toBe(200);
      // 指標在沒有任何觀測值前就該出現在輸出中（# HELP / # TYPE），
      // 否則儀表板在流量為零時會顯示「沒有這個指標」而非「值為零」
      expect(res.text).toContain(METRIC_NAMES.MESSAGES);
      expect(res.text).toContain(METRIC_NAMES.RATE_LIMITED);
      expect(res.text).toContain(METRIC_NAMES.CONNECTIONS);
    });

    // 房間數無界，標籤基數爆炸是監控系統最典型的自傷方式
    it('指標的標籤不含房間 ID', async () => {
      const res = await request(app.getHttpServer()).get('/api/metrics');

      expect(res.text).not.toContain(roomId);
    });
  });

  describe('行為稽核', () => {
    const auditRows = () =>
      prisma.chatAuditLogRecord.findMany({ orderBy: { createdAt: 'asc' } });

    it('離開房間會留下稽核紀錄', async () => {
      await request(app.getHttpServer())
        .delete(`/api/front/chat-rooms/${roomId}/members/me`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe('ROOM_LEFT');
      expect(rows[0].memberId).toBe(idA);
      expect(rows[0].roomId).toBe(roomId);
    });

    // 判準是「證據會不會消失」，不是「這件事重不重要」——
    // chat_messages 已經記了發送者、房間、時間、序號
    it('送出訊息不會留下稽核紀錄', async () => {
      await prisma.chatMessageRecord.create({
        data: {
          roomId,
          senderId: idA,
          content: '一則訊息',
          seq: 1,
          clientMessageId: 'c-1',
        },
      });

      expect(await auditRows()).toHaveLength(0);
    });

    it('嘗試撤回他人的訊息會留下稽核紀錄', async () => {
      const message = await prisma.chatMessageRecord.create({
        data: {
          roomId,
          senderId: idB,
          content: 'B 發的',
          seq: 1,
          clientMessageId: 'c-1',
        },
      });

      await request(app.getHttpServer())
        .delete(`/api/front/chat-rooms/${roomId}/messages/${message.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe('MESSAGE_RETRACT_REJECTED');
      expect(rows[0].targetMemberId).toBe(idB);
      expect(rows[0].targetMessageId).toBe(message.id);
    });

    // 內容已在 chat_messages（撤回也保留），複製一份等於多一條洩漏路徑
    it('稽核紀錄不含訊息內容', async () => {
      const message = await prisma.chatMessageRecord.create({
        data: {
          roomId,
          senderId: idA,
          content: '這段內容不該出現在稽核表',
          seq: 1,
          clientMessageId: 'c-1',
        },
      });

      await request(app.getHttpServer())
        .delete(`/api/front/chat-rooms/${roomId}/messages/${message.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const rows = await auditRows();
      expect(JSON.stringify(rows)).not.toContain('這段內容不該出現在稽核表');
    });

    it('撤回成功會留下稽核紀錄', async () => {
      const message = await prisma.chatMessageRecord.create({
        data: {
          roomId,
          senderId: idA,
          content: '自己發的',
          seq: 1,
          clientMessageId: 'c-1',
        },
      });

      await request(app.getHttpServer())
        .delete(`/api/front/chat-rooms/${roomId}/messages/${message.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const rows = await auditRows();
      expect(rows.map((r) => r.action)).toEqual(['MESSAGE_RETRACTED']);
    });
  });
});
