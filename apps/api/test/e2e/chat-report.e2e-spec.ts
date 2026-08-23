import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { ResponseCodes } from '@app/shared/constants/response-codes';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedUser } from '../helpers/db';
import { describeUnauthorized, expectApiError } from '../helpers/assertions';

const PASSWORD = 'TestPass123!';
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';
const CONTENT = '這是被檢舉的原始內容';

type ReportBody = {
  data: { reportId: string; status: string; createdAt: string };
};

describe('ChatReport E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

  // A 檢舉 B 的訊息；C 是局外人（不是房間成員）
  let tokenA = '';
  let tokenB = '';
  let tokenC = '';
  let idA = '';
  let idB = '';
  let roomId = '';
  let messageId = '';

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/front/auth/login')
      .send({ email, password: PASSWORD });
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  };

  const report = (body: Record<string, unknown>, token = tokenA) =>
    request(app.getHttpServer())
      .post('/api/front/chat-reports')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

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
    tokenB = await login('b@test.com');
    tokenC = await login('c@test.com');

    const room = await prisma.chatRoomRecord.create({
      data: {
        roomType: 'GROUP',
        name: '檢舉測試房間',
        lastSeq: 1,
        members: { create: [{ memberId: idA }, { memberId: idB }] },
      },
    });
    roomId = room.id;

    const message = await prisma.chatMessageRecord.create({
      data: {
        roomId,
        senderId: idB,
        content: CONTENT,
        seq: 1,
        clientMessageId: 'c-1',
      },
    });
    messageId = message.id;
  });

  describe('未授權存取', () => {
    describeUnauthorized(() => app, 'post', '/api/front/chat-reports');
  });

  it('成員檢舉他人訊息 → 200 + PENDING，且快照等於原內容', async () => {
    const res = await report({ messageId, reason: 'HARASSMENT' });

    expect(res.status).toBe(200);
    expect((res.body as ReportBody).data.status).toBe('PENDING');

    const row = await prisma.chatReportRecord.findUniqueOrThrow({
      where: { id: (res.body as ReportBody).data.reportId },
    });
    expect(row.contentSnapshot).toBe(CONTENT);
    expect(row.targetMemberId).toBe(idB);
    expect(row.roomId).toBe(roomId);
  });

  // 檢舉人已經知道那是誰；回傳只會多一條可被用來確認身分的路徑
  it('回應不含被檢舉者資訊與內容快照', async () => {
    const res = await report({ messageId, reason: 'SPAM' });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(idB);
    expect(body).not.toContain(CONTENT);
  });

  // 使用者連點兩下送出鈕就會產生兩筆
  it('重複檢舉 → 回同一個 reportId，DB 只有一筆', async () => {
    const first = await report({ messageId, reason: 'HARASSMENT' });
    const second = await report({ messageId, reason: 'SPAM' });

    expect((second.body as ReportBody).data.reportId).toBe(
      (first.body as ReportBody).data.reportId,
    );
    expect(await prisma.chatReportRecord.count()).toBe(1);
  });

  // 「幾個人檢舉」本身是優先序訊號，合併成一筆會把它弄丟
  it('不同人檢舉同一則 → 各自一筆', async () => {
    await report({ messageId, reason: 'HARASSMENT' });

    // B 是自己發的不能檢舉，改由 C 加入房間後檢舉
    const c = await prisma.userRecord.findFirstOrThrow({
      where: { email: 'c@test.com' },
    });
    await prisma.chatRoomMemberRecord.create({
      data: { roomId, memberId: c.id },
    });
    await report({ messageId, reason: 'SPAM' }, tokenC);

    expect(await prisma.chatReportRecord.count()).toBe(2);
  });

  it('非成員檢舉 → 404，與「訊息不存在」同一個錯誤碼', async () => {
    const notMember = await report({ messageId, reason: 'SPAM' }, tokenC);
    const missing = await report({ messageId: MISSING_ID, reason: 'SPAM' });

    expectApiError(notMember, 404, ResponseCodes.CHAT_MESSAGE_NOT_FOUND);
    expect((missing.body as { code: string }).code).toBe(
      (notMember.body as { code: string }).code,
    );
    expect(await prisma.chatReportRecord.count()).toBe(0);
  });

  // 檢舉自己會是繞過撤回時限的側門
  it('檢舉自己的訊息 → 400 CHAT_REPORT_SELF', async () => {
    const res = await report({ messageId, reason: 'SPAM' }, tokenB);

    expectApiError(res, 400, ResponseCodes.CHAT_REPORT_SELF);
    expect(await prisma.chatReportRecord.count()).toBe(0);
  });

  // 撤回不該讓行為變得無法檢舉；沒有快照的話管理員會看到一則空訊息
  it('檢舉已撤回的訊息 → 照常受理，快照是原內容而非空字串', async () => {
    await prisma.chatMessageRecord.update({
      where: { id: messageId },
      data: { retractedAt: new Date(), retractedBy: idB },
    });

    const res = await report({ messageId, reason: 'HARASSMENT' });

    expect(res.status).toBe(200);
    const row = await prisma.chatReportRecord.findUniqueOrThrow({
      where: { id: (res.body as ReportBody).data.reportId },
    });
    expect(row.contentSnapshot).toBe(CONTENT);
  });

  it('留下 REPORT_SUBMITTED 稽核紀錄', async () => {
    await report({ messageId, reason: 'HARASSMENT' });

    const rows = await prisma.chatAuditLogRecord.findMany();
    expect(rows.map((r) => r.action)).toEqual(['REPORT_SUBMITTED']);
    expect(rows[0].memberId).toBe(idA);
    expect(rows[0].targetMemberId).toBe(idB);
  });

  it('reason 不在允許的分類中 → 400', async () => {
    const res = await report({ messageId, reason: 'WHATEVER' });
    expect(res.status).toBe(400);
  });

  it('description 超過上限 → 400', async () => {
    const res = await report({
      messageId,
      reason: 'OTHER',
      description: 'x'.repeat(501),
    });
    expect(res.status).toBe(400);
  });
});
