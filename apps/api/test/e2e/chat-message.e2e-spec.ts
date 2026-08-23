import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { ResponseCodes } from '@app/shared/constants/response-codes';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedUser } from '../helpers/db';
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
      .post('/api/front/auth/login')
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

    const a = await seedUser(prisma, {
      email: 'a@test.com',
      password: PASSWORD,
    });
    const b = await seedUser(prisma, {
      email: 'b@test.com',
      password: PASSWORD,
    });
    await seedUser(prisma, {
      email: 'c@test.com',
      password: PASSWORD,
    });
    idA = a.userId;
    idB = b.userId;
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

  describe('撤回訊息', () => {
    const retract = (messageId: string, token = tokenA) =>
      request(app.getHttpServer())
        .delete(`/api/front/chat-rooms/${roomId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${token}`);

    /** 由 A 送出一則訊息並回傳它的 id；createdAt 可覆寫以測試時限 */
    const seedOwnMessage = async (createdAt?: Date): Promise<string> => {
      const message = await prisma.chatMessageRecord.create({
        data: {
          roomId,
          senderId: idA,
          content: '這則會被撤回',
          seq: 1,
          clientMessageId: 'own-1',
          ...(createdAt ? { createdAt } : {}),
        },
      });
      await prisma.chatRoomRecord.update({
        where: { id: roomId },
        data: { lastSeq: 1 },
      });
      return message.id;
    };

    it('發送者在時限內撤回 → 204 且標記為已撤回', async () => {
      const messageId = await seedOwnMessage();

      const res = await retract(messageId);

      expect(res.status).toBe(204);
      const row = await prisma.chatMessageRecord.findUniqueOrThrow({
        where: { id: messageId },
      });
      expect(row.retractedAt).not.toBeNull();
      expect(row.retractedBy).toBe(idA);
    });

    // 內容保留供 M3 的檢舉調查——騷擾者送完立即撤回是最典型的行為
    it('撤回後內容仍保留在資料庫', async () => {
      const messageId = await seedOwnMessage();

      await retract(messageId);

      const row = await prisma.chatMessageRecord.findUniqueOrThrow({
        where: { id: messageId },
      });
      expect(row.content).toBe('這則會被撤回');
    });

    // 讀取路徑之一：漏掉這條就是內容洩漏
    it('撤回後歷史查詢看不到內容，但該則仍在且 seq 保留', async () => {
      const messageId = await seedOwnMessage();
      await retract(messageId);

      const res = await request(app.getHttpServer())
        .get(`/api/front/chat-rooms/${roomId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`);

      const rows = (
        res.body as {
          data: {
            list: {
              messageId: string;
              seq: number;
              content: string;
              retractedAt: string | null;
            }[];
          };
        }
      ).data.list;
      expect(rows).toHaveLength(1);
      expect(rows[0].seq).toBe(1);
      expect(rows[0].content).toBe('');
      expect(rows[0].retractedAt).not.toBeNull();
    });

    // 撤回是收斂到某個狀態，不是遞增操作
    it('重複撤回 → 204，且撤回時間不被覆寫', async () => {
      const messageId = await seedOwnMessage();
      await retract(messageId);
      const first = await prisma.chatMessageRecord.findUniqueOrThrow({
        where: { id: messageId },
      });

      const res = await retract(messageId);

      expect(res.status).toBe(204);
      const second = await prisma.chatMessageRecord.findUniqueOrThrow({
        where: { id: messageId },
      });
      expect(second.retractedAt).toEqual(first.retractedAt);
    });

    it('撤回他人的訊息 → 404 CHAT_MESSAGE_NOT_FOUND', async () => {
      const other = await prisma.chatMessageRecord.create({
        data: {
          roomId,
          senderId: idB,
          content: 'B 發的',
          seq: 1,
          clientMessageId: 'other-1',
        },
      });

      const res = await retract(other.id);

      expectApiError(res, 404, ResponseCodes.CHAT_MESSAGE_NOT_FOUND);
    });

    it('訊息不存在 → 與「不是你的」同一個錯誤碼', async () => {
      const res = await retract(MISSING_ID);
      expectApiError(res, 404, ResponseCodes.CHAT_MESSAGE_NOT_FOUND);
    });

    // 時限預設 300 秒；建一則 10 分鐘前的訊息
    it('超過時限 → 403 CHAT_MESSAGE_RETRACT_EXPIRED', async () => {
      const messageId = await seedOwnMessage(new Date(Date.now() - 600_000));

      const res = await retract(messageId);

      expectApiError(res, 403, ResponseCodes.CHAT_MESSAGE_RETRACT_EXPIRED);
    });

    it('非成員撤回 → 404 CHAT_ROOM_NOT_FOUND', async () => {
      const messageId = await seedOwnMessage();

      const res = await retract(messageId, tokenC);

      expectApiError(res, 404, ResponseCodes.CHAT_ROOM_NOT_FOUND);
    });
  });
});
