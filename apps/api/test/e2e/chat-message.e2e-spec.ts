import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { ResponseCodes } from '@app/shared/constants/response-codes';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';
import { describeUnauthorized, expectApiError } from '../helpers/assertions';

const PASSWORD = 'TestPass123!';
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

type ListBody = {
  data: { list: { messageId: string; seq: number }[]; hasMore: boolean };
};

describe('ChatMessage E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

  let tokenA = '';
  let tokenC = '';
  let idA = '';
  let idB = '';
  let roomId = '';

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email, password: PASSWORD });
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  };

  /** 直接落庫，不經 WS——本測試驗的是 REST 的讀取面 */
  const seedMessages = async (count: number): Promise<void> => {
    await prisma.chatMessageRecord.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        roomId,
        senderId: idB,
        content: `第 ${i + 1} 則`,
        seq: i + 1,
        clientMessageId: `client-${i + 1}`,
      })),
    });
    await prisma.chatRoomRecord.update({
      where: { id: roomId },
      data: { lastSeq: count },
    });
  };

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

    const a = await seedMember(prisma, {
      email: 'a@test.com',
      password: PASSWORD,
    });
    const b = await seedMember(prisma, {
      email: 'b@test.com',
      password: PASSWORD,
      roleName: 'member-b',
    });
    await seedMember(prisma, {
      email: 'c@test.com',
      password: PASSWORD,
      roleName: 'member-c',
    });
    idA = a.memberId;
    idB = b.memberId;
    tokenA = await login('a@test.com');
    tokenC = await login('c@test.com');

    const room = await prisma.chatRoomRecord.create({
      data: {
        roomType: 'GROUP',
        name: '專案討論',
        members: { create: [{ memberId: idA }, { memberId: idB }] },
      },
    });
    roomId = room.id;
  });

  describe('未授權存取', () => {
    describeUnauthorized(
      () => app,
      'get',
      `/api/front/chat-rooms/${MISSING_ID}/messages`,
    );
    describeUnauthorized(
      () => app,
      'patch',
      `/api/front/chat-rooms/${MISSING_ID}/read`,
    );
  });

  describe('歷史訊息', () => {
    const list = (query: Record<string, number> = {}) =>
      request(app.getHttpServer())
        .get(`/api/front/chat-rooms/${roomId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .query(query);

    it('預設由新到舊回傳', async () => {
      await seedMessages(3);

      const res = await list();

      expect(res.status).toBe(200);
      const { list: rows, hasMore } = (res.body as ListBody).data;
      expect(rows.map((m) => m.seq)).toEqual([3, 2, 1]);
      expect(hasMore).toBe(false);
    });

    it('超過 limit 時 hasMore 為 true', async () => {
      await seedMessages(5);

      const res = await list({ limit: 2 });

      const { list: rows, hasMore } = (res.body as ListBody).data;
      expect(rows.map((m) => m.seq)).toEqual([5, 4]);
      expect(hasMore).toBe(true);
    });

    // 頁碼分頁在這裡會重複或跳過；游標分頁不受新寫入影響
    it('往回翻頁不與上一批重疊', async () => {
      await seedMessages(5);

      const first = await list({ limit: 2 });
      const oldest = (first.body as ListBody).data.list.at(-1)?.seq ?? 0;
      const second = await list({ limit: 2, beforeSeq: oldest });

      expect((second.body as ListBody).data.list.map((m) => m.seq)).toEqual([
        3, 2,
      ]);
    });

    it('剛好取完時 hasMore 為 false', async () => {
      await seedMessages(2);

      const res = await list({ limit: 2 });

      expect((res.body as ListBody).data.hasMore).toBe(false);
    });

    it('非成員查詢 → 404 而非 403', async () => {
      await seedMessages(1);

      const res = await request(app.getHttpServer())
        .get(`/api/front/chat-rooms/${roomId}/messages`)
        .set('Authorization', `Bearer ${tokenC}`);

      expectApiError(res, 404, ResponseCodes.CHAT_ROOM_NOT_FOUND);
    });

    it('房間不存在 → 與非成員同一個錯誤碼', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/front/chat-rooms/${MISSING_ID}/messages`)
        .set('Authorization', `Bearer ${tokenA}`);

      expectApiError(res, 404, ResponseCodes.CHAT_ROOM_NOT_FOUND);
    });
  });

  describe('已讀位置', () => {
    const markRead = (lastReadSeq: number, token = tokenA) =>
      request(app.getHttpServer())
        .patch(`/api/front/chat-rooms/${roomId}/read`)
        .set('Authorization', `Bearer ${token}`)
        .send({ lastReadSeq });

    const currentSeq = async (): Promise<number | undefined> =>
      (
        await prisma.chatRoomReadRecord.findUnique({
          where: { roomId_memberId: { roomId, memberId: idA } },
        })
      )?.lastReadSeq;

    it('前進 → 204 且落庫', async () => {
      await seedMessages(5);

      const res = await markRead(3);

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      expect(await currentSeq()).toBe(3);
    });

    // 往回捲不代表未讀；回錯誤會逼客戶端自己維護一份很容易失準的狀態
    it('送出比目前小的值 → 204 但不改變資料', async () => {
      await seedMessages(5);
      await markRead(4);

      const res = await markRead(2);

      expect(res.status).toBe(204);
      expect(await currentSeq()).toBe(4);
    });

    it('相同的值 → 204 且不變', async () => {
      await seedMessages(5);
      await markRead(4);

      await markRead(4);

      expect(await currentSeq()).toBe(4);
    });

    // 允許的話，那些訊息之後真的送出時會一出生就是已讀
    it('超過房間最新 seq → 夾在最新', async () => {
      await seedMessages(3);

      await markRead(999);

      expect(await currentSeq()).toBe(3);
    });

    it('房間還沒有訊息 → 夾到 0', async () => {
      await markRead(5);

      expect(await currentSeq()).toBe(0);
    });

    it('非成員更新 → 404', async () => {
      await seedMessages(1);

      const res = await markRead(1, tokenC);

      expectApiError(res, 404, ResponseCodes.CHAT_ROOM_NOT_FOUND);
    });

    it('lastReadSeq 非正整數 → 400', async () => {
      const res = await markRead(0);
      expect(res.status).toBe(400);
    });
  });
});
