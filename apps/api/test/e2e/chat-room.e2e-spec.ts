import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { ResponseCodes } from '@app/shared/constants/response-codes';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember, seedUser } from '../helpers/db';
import {
  describeUnauthorized,
  expectApiError,
  expectUnauthorized,
} from '../helpers/assertions';

const PASSWORD = 'TestPass123!';
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

type RoomBody = {
  data: {
    id: string;
    roomType: string;
    name: string | null;
    memberCount: number;
  };
};

describe('ChatRoom E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

  // 三個帳號：A 與 B 是房間成員，C 是局外人——「看不到別人的房間」需要一個局外人才驗得出來
  let tokenA = '';
  let idA = '';
  let idB = '';
  let tokenC = '';
  let adminToken = '';

  /** 前台登入——聊天的參與者是前台使用者，不是後台管理員 */
  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/front/auth/login')
      .send({ email, password: PASSWORD });
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  };

  const asA = (method: 'get' | 'post' | 'delete', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${tokenA}`);

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
    await seedUser(prisma, { email: 'c@test.com', password: PASSWORD });
    idA = a.userId;
    idB = b.userId;
    tokenA = await login('a@test.com');
    tokenC = await login('c@test.com');

    // 後台帳號：只用來證明它的 token 打不進前台聊天
    await seedMember(prisma, {
      email: 'admin@test.com',
      password: PASSWORD,
    });
    const adminRes = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: 'admin@test.com', password: PASSWORD });
    adminToken = (adminRes.body as { data: { accessToken: string } }).data
      .accessToken;
  });

  /**
   * 切換到前台身分的直接證據。
   *
   * `migrate-chat-to-front-users` 之前這四支端點吃的是**後台 token**（會回 200）；
   * 之後必須一律 401——而且不是因為權限不足，是簽章根本驗不過。
   */
  describe('⭐ 後台 token 打前台聊天端點', () => {
    it('列出房間 → 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/front/chat-rooms')
        .set('Authorization', `Bearer ${adminToken}`);
      expectUnauthorized(res);
    });

    it('建立私聊 → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/front/chat-rooms/direct')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ targetMemberId: idB });
      expectUnauthorized(res);
    });
  });

  describe('未授權存取', () => {
    describeUnauthorized(() => app, 'get', '/api/front/chat-rooms');
    describeUnauthorized(() => app, 'post', '/api/front/chat-rooms/direct');
    describeUnauthorized(() => app, 'post', '/api/front/chat-rooms/group');
    describeUnauthorized(
      () => app,
      'delete',
      `/api/front/chat-rooms/${MISSING_ID}/members/me`,
    );
  });

  describe('建立私聊', () => {
    it('首次建立 → 200 + 兩人皆為成員', async () => {
      const res = await asA('post', '/api/front/chat-rooms/direct').send({
        targetMemberId: idB,
      });

      expect(res.status).toBe(200);
      const { id, roomType, memberCount } = (res.body as RoomBody).data;
      expect(roomType).toBe('DIRECT');
      expect(memberCount).toBe(2);

      const members = await prisma.chatRoomMemberRecord.findMany({
        where: { roomId: id },
      });
      expect(members.map((m) => m.memberId).sort()).toEqual([idA, idB].sort());
    });

    it('重複建立 → 回傳同一個房間，不新增第二個', async () => {
      const first = await asA('post', '/api/front/chat-rooms/direct').send({
        targetMemberId: idB,
      });
      const second = await asA('post', '/api/front/chat-rooms/direct').send({
        targetMemberId: idB,
      });

      expect((second.body as RoomBody).data.id).toBe(
        (first.body as RoomBody).data.id,
      );
      expect(await prisma.chatRoomRecord.count()).toBe(1);
    });

    // 由 B 發起時 directKey 的兩個 ID 順序相反；沒有排序正規化的話這裡會建出第二個房間
    it('反方向建立 → 仍是同一個房間', async () => {
      await asA('post', '/api/front/chat-rooms/direct').send({
        targetMemberId: idB,
      });
      const tokenB = await login('b@test.com');
      const res = await request(app.getHttpServer())
        .post('/api/front/chat-rooms/direct')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ targetMemberId: idA });

      expect(res.status).toBe(200);
      expect(await prisma.chatRoomRecord.count()).toBe(1);
    });

    it('對自己建立 → 400 CHAT_ROOM_SELF_DIRECT', async () => {
      const res = await asA('post', '/api/front/chat-rooms/direct').send({
        targetMemberId: idA,
      });
      expectApiError(res, 400, ResponseCodes.CHAT_ROOM_SELF_DIRECT);
    });

    it('對象不存在 → 404 MEMBER_NOT_FOUND', async () => {
      const res = await asA('post', '/api/front/chat-rooms/direct').send({
        targetMemberId: MISSING_ID,
      });
      expectApiError(res, 404, ResponseCodes.MEMBER_NOT_FOUND);
    });
  });

  describe('建立群組', () => {
    it('合法名單 → 201 + 建立者與名單皆為成員', async () => {
      const res = await asA('post', '/api/front/chat-rooms/group').send({
        name: '專案討論',
        memberIds: [idB],
      });

      expect(res.status).toBe(201);
      const { id, roomType, name, memberCount } = (res.body as RoomBody).data;
      expect(roomType).toBe('GROUP');
      expect(name).toBe('專案討論');
      expect(memberCount).toBe(2);

      const members = await prisma.chatRoomMemberRecord.findMany({
        where: { roomId: id },
      });
      expect(members.map((m) => m.memberId).sort()).toEqual([idA, idB].sort());
    });

    // 部分成功會讓呼叫端以為所有人都加入了，而且沒有任何徵兆
    it('名單含不存在的 ID → 404 且完全不建立房間', async () => {
      const res = await asA('post', '/api/front/chat-rooms/group').send({
        name: '專案討論',
        memberIds: [idB, MISSING_ID],
      });

      expectApiError(res, 404, ResponseCodes.MEMBER_NOT_FOUND);
      expect(await prisma.chatRoomRecord.count()).toBe(0);
    });

    it('名單為空 → 400（schema 擋下）', async () => {
      const res = await asA('post', '/api/front/chat-rooms/group').send({
        name: '專案討論',
        memberIds: [],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('查詢自己的房間', () => {
    it('只看得到自己是成員的房間', async () => {
      await asA('post', '/api/front/chat-rooms/group').send({
        name: 'A 與 B 的群組',
        memberIds: [idB],
      });

      const mine = await asA('get', '/api/front/chat-rooms');
      expect(mine.status).toBe(200);
      expect(
        (mine.body as { data: { list: unknown[] } }).data.list,
      ).toHaveLength(1);

      // C 不是成員：同一份資料在他眼中必須是空的
      const stranger = await request(app.getHttpServer())
        .get('/api/front/chat-rooms')
        .set('Authorization', `Bearer ${tokenC}`);
      expect(
        (stranger.body as { data: { list: unknown[] } }).data.list,
      ).toHaveLength(0);
    });

    it('回傳分頁 meta', async () => {
      const res = await asA('get', '/api/front/chat-rooms').query({
        page: 1,
        limit: 10,
      });
      expect(
        (res.body as { data: { meta: { page: number } } }).data.meta.page,
      ).toBe(1);
    });
  });

  describe('離開房間', () => {
    const createGroup = async (): Promise<string> => {
      const res = await asA('post', '/api/front/chat-rooms/group').send({
        name: '專案討論',
        memberIds: [idB],
      });
      return (res.body as RoomBody).data.id;
    };

    it('成員離開 → 204 且成員關係被移除', async () => {
      const roomId = await createGroup();
      const res = await asA(
        'delete',
        `/api/front/chat-rooms/${roomId}/members/me`,
      );

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      const left = await prisma.chatRoomMemberRecord.findFirst({
        where: { roomId, memberId: idA },
      });
      expect(left).toBeNull();
    });

    // 回 403 等於告訴對方「這個房間存在」；兩種情形必須不可區分
    it('非成員離開 → 404 而非 403', async () => {
      const roomId = await createGroup();
      const res = await request(app.getHttpServer())
        .delete(`/api/front/chat-rooms/${roomId}/members/me`)
        .set('Authorization', `Bearer ${tokenC}`);

      expectApiError(res, 404, ResponseCodes.CHAT_ROOM_NOT_FOUND);
    });

    it('房間不存在 → 與非成員同一個錯誤碼', async () => {
      const roomId = await createGroup();
      const notMember = await request(app.getHttpServer())
        .delete(`/api/front/chat-rooms/${roomId}/members/me`)
        .set('Authorization', `Bearer ${tokenC}`);
      const noRoom = await request(app.getHttpServer())
        .delete(`/api/front/chat-rooms/${MISSING_ID}/members/me`)
        .set('Authorization', `Bearer ${tokenC}`);

      expect(noRoom.status).toBe(notMember.status);
      expect((noRoom.body as { code: string }).code).toBe(
        (notMember.body as { code: string }).code,
      );
    });
  });
});
