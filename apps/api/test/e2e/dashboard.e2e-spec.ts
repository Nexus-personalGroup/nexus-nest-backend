import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { PermissionCode } from '@app/domain/value-object/Role';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';
import { describeUnauthorized, expectForbidden } from '../helpers/assertions';

const PASSWORD = 'TestPass123!';
const PATH = '/api/admin/moderation/dashboard';

type SnapshotBody = {
  data: {
    onlineMembers: number;
    pendingReports: number;
    totalRooms: number;
    totalMembers: number;
    messagesToday: number;
    generatedAt: string;
  };
};

describe('Dashboard E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

  let tokenFull = '';
  let tokenNone = '';
  let memberId = '';

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email, password: PASSWORD });
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  };

  const snapshot = (token = tokenFull) =>
    request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', `Bearer ${token}`);

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
    mockRedis.scanKeys.mockResolvedValue([]);
    mockRedis.hashGetAll.mockResolvedValue({});
    await resetDb(prisma);

    const admin = await seedMember(prisma, {
      email: 'admin@test.com',
      password: PASSWORD,
      permissionCodes: [PermissionCode.BACKEND_MODERATION_VIEW],
    });
    await seedMember(prisma, {
      email: 'nobody@test.com',
      password: PASSWORD,
      roleName: 'nobody',
      permissionCodes: ['BACKEND:ACCOUNT:VIEW'],
    });
    memberId = admin.memberId;
    tokenFull = await login('admin@test.com');
    tokenNone = await login('nobody@test.com');
  });

  describe('未授權存取', () => {
    describeUnauthorized(() => app, 'get', PATH);
  });

  /**
   * 用 `Object.keys().sort()` 而非 `objectContaining`。
   *
   * 儀表板最容易發生的越界是「順手多回一個有用的數字」，
   * 而多回的那個可能帶有識別資訊（例如「最活躍的成員」）。
   */
  it('⭐ 回應只有六個欄位', async () => {
    const res = await snapshot();

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data as object).sort()).toEqual([
      'generatedAt',
      'messagesToday',
      'onlineMembers',
      'pendingReports',
      'totalMembers',
      'totalRooms',
    ]);
  });

  it('空資料庫 → 數字為 0（成員數除外，種子有兩個帳號）', async () => {
    const res = await snapshot();

    const { data } = res.body as SnapshotBody;
    expect(data.onlineMembers).toBe(0);
    expect(data.pendingReports).toBe(0);
    expect(data.totalRooms).toBe(0);
    expect(data.messagesToday).toBe(0);
  });

  it('只算待處理的檢舉', async () => {
    const room = await prisma.chatRoomRecord.create({
      data: { roomType: 'GROUP', name: '房', lastSeq: 1 },
    });
    const message = await prisma.chatMessageRecord.create({
      data: {
        roomId: room.id,
        senderId: memberId,
        content: '內容',
        seq: 1,
        clientMessageId: 'c-1',
      },
    });
    await prisma.chatReportRecord.createMany({
      data: [
        {
          reporterId: memberId,
          targetMessageId: message.id,
          targetMemberId: memberId,
          roomId: room.id,
          reason: 'SPAM',
          contentSnapshot: '內容',
          status: 'PENDING',
        },
        {
          reporterId: memberId,
          targetMessageId: `${message.id}-other`,
          targetMemberId: memberId,
          roomId: room.id,
          reason: 'SPAM',
          contentSnapshot: '內容',
          status: 'REVIEWED',
        },
      ],
    });

    const res = await snapshot();

    expect((res.body as SnapshotBody).data.pendingReports).toBe(1);
  });

  /**
   * 日界依 `APP_TIMEZONE`（測試環境為 Asia/Taipei）。
   *
   * 用 UTC 的話這則訊息不會被計入，而症狀只在台灣時間 00:00–08:00 出現——
   * 那種錯誤很難被回報，也很難重現。
   */
  it('⭐ 今日訊息數依 APP_TIMEZONE 判定日界', async () => {
    const room = await prisma.chatRoomRecord.create({
      data: { roomType: 'GROUP', name: '房', lastSeq: 1 },
    });
    // 台北今天的 00:30；若日界用 UTC，它會落在「昨天」而不被計入
    const taipeiEarlyToday = new Date();
    taipeiEarlyToday.setUTCHours(taipeiEarlyToday.getUTCHours() - 24);
    const localMidnight = new Date();
    localMidnight.setHours(0, 30, 0, 0);

    await prisma.chatMessageRecord.create({
      data: {
        roomId: room.id,
        senderId: memberId,
        content: '凌晨的訊息',
        seq: 1,
        clientMessageId: 'c-early',
        createdAt: localMidnight,
      },
    });

    const res = await snapshot();

    expect((res.body as SnapshotBody).data.messagesToday).toBe(1);
    expect(taipeiEarlyToday.getTime()).toBeLessThan(Date.now());
  });

  it('昨天的訊息不計入今日', async () => {
    const room = await prisma.chatRoomRecord.create({
      data: { roomType: 'GROUP', name: '房', lastSeq: 1 },
    });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await prisma.chatMessageRecord.create({
      data: {
        roomId: room.id,
        senderId: memberId,
        content: '昨天的訊息',
        seq: 1,
        clientMessageId: 'c-yesterday',
        createdAt: yesterday,
      },
    });

    const res = await snapshot();

    expect((res.body as SnapshotBody).data.messagesToday).toBe(0);
  });

  // 回應只有聚合數字，記了會讓稽核量與「點了幾下」對齊
  it('⭐ 查快照不寫任何稽核', async () => {
    await snapshot();
    await snapshot();

    expect(await prisma.chatAuditLogRecord.count()).toBe(0);
  });

  it('只有 ACCOUNT:VIEW → 403', async () => {
    expectForbidden(await snapshot(tokenNone));
  });

  // SSE 端點的授權必須在建立串流之前判定，否則沒有權限的人會拿到一條開著的連線
  it('⭐ 沒有權限時 SSE 不建立串流', async () => {
    const res = await request(app.getHttpServer())
      .get(`${PATH}/stream`)
      .set('Authorization', `Bearer ${tokenNone}`);

    expectForbidden(res);
  });
});
