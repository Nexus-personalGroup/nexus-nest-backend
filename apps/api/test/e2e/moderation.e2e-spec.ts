import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { ResponseCodes } from '@app/shared/constants/response-codes';
import { PermissionCode } from '@app/domain/value-object/Role';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';
import {
  describeUnauthorized,
  expectApiError,
  expectForbidden,
} from '../helpers/assertions';

const PASSWORD = 'TestPass123!';
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';
const SNAPSHOT = '被檢舉時的訊息內容';

type ListBody = { data: { list: { reportId: string }[] } };
type DetailBody = { data: { contentSnapshot?: string; reportId: string } };

describe('Moderation E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

  // 三種身分：全權限、只有 VIEW、完全沒有 moderation 權限
  let tokenFull = '';
  let tokenViewOnly = '';
  let tokenNone = '';
  let adminId = '';
  let offenderId = '';
  let reportId = '';

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email, password: PASSWORD });
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  };

  const asFull = (method: 'get' | 'patch', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${tokenFull}`);

  const auditRows = () =>
    prisma.chatAuditLogRecord.findMany({ orderBy: { createdAt: 'asc' } });

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

    const admin = await seedMember(prisma, {
      email: 'admin@test.com',
      password: PASSWORD,
      permissionCodes: [
        PermissionCode.BACKEND_MODERATION_VIEW,
        PermissionCode.BACKEND_MODERATION_EDIT,
      ],
    });
    await seedMember(prisma, {
      email: 'viewer@test.com',
      password: PASSWORD,
      roleName: 'viewer',
      permissionCodes: [PermissionCode.BACKEND_MODERATION_VIEW],
    });
    const offender = await seedMember(prisma, {
      email: 'offender@test.com',
      password: PASSWORD,
      roleName: 'offender',
      permissionCodes: ['BACKEND:ACCOUNT:VIEW'],
    });
    adminId = admin.memberId;
    offenderId = offender.memberId;
    tokenFull = await login('admin@test.com');
    tokenViewOnly = await login('viewer@test.com');
    tokenNone = await login('offender@test.com');

    const room = await prisma.chatRoomRecord.create({
      data: { roomType: 'GROUP', name: '審閱測試房間', lastSeq: 1 },
    });
    const message = await prisma.chatMessageRecord.create({
      data: {
        roomId: room.id,
        senderId: offenderId,
        content: SNAPSHOT,
        seq: 1,
        clientMessageId: 'c-1',
      },
    });
    const report = await prisma.chatReportRecord.create({
      data: {
        reporterId: adminId,
        targetMessageId: message.id,
        targetMemberId: offenderId,
        roomId: room.id,
        reason: 'HARASSMENT',
        description: '持續辱罵',
        contentSnapshot: SNAPSHOT,
      },
    });
    reportId = report.id;
  });

  describe('未授權存取', () => {
    describeUnauthorized(() => app, 'get', '/api/admin/moderation/reports');
    describeUnauthorized(
      () => app,
      'get',
      `/api/admin/moderation/reports/${MISSING_ID}`,
    );
    describeUnauthorized(
      () => app,
      'patch',
      `/api/admin/moderation/reports/${MISSING_ID}`,
    );
  });

  describe('檢舉佇列', () => {
    it('預設只回待處理', async () => {
      const res = await asFull('get', '/api/admin/moderation/reports');

      expect(res.status).toBe(200);
      expect((res.body as ListBody).data.list).toHaveLength(1);
    });

    // 列表看不到任何敏感內容——這是「稽核量與實際看到次數對齊」的前提
    it('⭐ 列表不含 contentSnapshot', async () => {
      const res = await asFull('get', '/api/admin/moderation/reports');

      expect(JSON.stringify(res.body)).not.toContain(SNAPSHOT);
    });

    // 列表沒有看到內容，記稽核會讓稽核量與「點了幾下」對齊而非「看到了什麼」
    it('⭐ 瀏覽列表不寫任何稽核', async () => {
      await asFull('get', '/api/admin/moderation/reports');

      expect(await auditRows()).toHaveLength(0);
    });

    it('沒有 moderation 權限 → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/moderation/reports')
        .set('Authorization', `Bearer ${tokenNone}`);

      expectForbidden(res);
    });
  });

  describe('檢舉詳情', () => {
    it('回傳含 contentSnapshot 的詳情', async () => {
      const res = await asFull(
        'get',
        `/api/admin/moderation/reports/${reportId}`,
      );

      expect(res.status).toBe(200);
      expect((res.body as DetailBody).data.contentSnapshot).toBe(SNAPSHOT);
    });

    // 這是唯一能看到被撤回訊息內容的路徑；查看不留痕跡的話，
    // 它與「任何人都看得到」在事後沒有實質區別
    it('⭐ 查看詳情會寫入一筆 REPORT_VIEWED 稽核', async () => {
      await asFull('get', `/api/admin/moderation/reports/${reportId}`);

      const rows = await auditRows();
      expect(rows.map((r) => r.action)).toEqual(['REPORT_VIEWED']);
      expect(rows[0].memberId).toBe(adminId);
      expect(rows[0].targetMemberId).toBe(offenderId);
    });

    // 撤回不該讓調查失去依據
    it('被檢舉的訊息已撤回時，仍回傳快照內容', async () => {
      await prisma.chatMessageRecord.updateMany({
        where: { senderId: offenderId },
        data: { retractedAt: new Date(), retractedBy: offenderId },
      });

      const res = await asFull(
        'get',
        `/api/admin/moderation/reports/${reportId}`,
      );

      expect((res.body as DetailBody).data.contentSnapshot).toBe(SNAPSHOT);
    });

    it('檢舉不存在 → 404，且不寫稽核', async () => {
      const res = await asFull(
        'get',
        `/api/admin/moderation/reports/${MISSING_ID}`,
      );

      expectApiError(res, 404, ResponseCodes.CHAT_REPORT_NOT_FOUND);
      expect(await auditRows()).toHaveLength(0);
    });
  });

  describe('判定', () => {
    const review = (body: Record<string, unknown>, token = tokenFull) =>
      request(app.getHttpServer())
        .patch(`/api/admin/moderation/reports/${reportId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    it('標記為已處理 → 204 並記錄審閱者', async () => {
      const res = await review({ status: 'REVIEWED', reviewNote: '已警告' });

      expect(res.status).toBe(204);
      const row = await prisma.chatReportRecord.findUniqueOrThrow({
        where: { id: reportId },
      });
      expect(row.status).toBe('REVIEWED');
      expect(row.reviewedBy).toBe(adminId);
      expect(row.reviewNote).toBe('已警告');
      expect(row.reviewedAt).not.toBeNull();
    });

    it('終態間可互轉', async () => {
      await review({ status: 'REVIEWED' });
      const res = await review({ status: 'DISMISSED' });

      expect(res.status).toBe(204);
    });

    // 回到待處理是「重新開啟」，語意不同且目前沒有這個需求
    it('改回 PENDING → 400', async () => {
      const res = await review({ status: 'PENDING' });
      expect(res.status).toBe(400);
    });

    // 「能看的人」與「能判的人」在真實團隊裡經常不是同一群
    it('⭐ 只有 VIEW 權限 → 403', async () => {
      const res = await review({ status: 'REVIEWED' }, tokenViewOnly);

      expectForbidden(res);
      const row = await prisma.chatReportRecord.findUniqueOrThrow({
        where: { id: reportId },
      });
      expect(row.status).toBe('PENDING');
    });

    it('只有 VIEW 權限仍可查詳情', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/admin/moderation/reports/${reportId}`)
        .set('Authorization', `Bearer ${tokenViewOnly}`);

      expect(res.status).toBe(200);
    });

    it('檢舉不存在 → 404', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/admin/moderation/reports/${MISSING_ID}`)
        .set('Authorization', `Bearer ${tokenFull}`)
        .send({ status: 'REVIEWED' });

      expectApiError(res, 404, ResponseCodes.CHAT_REPORT_NOT_FOUND);
    });
  });

  describe('行為時間軸', () => {
    it('只回該成員的紀錄', async () => {
      await prisma.chatAuditLogRecord.createMany({
        data: [
          { memberId: offenderId, action: 'ROOM_LEFT' },
          { memberId: adminId, action: 'ROOM_JOINED' },
        ],
      });

      const res = await asFull(
        'get',
        `/api/admin/moderation/members/${offenderId}/timeline`,
      );

      expect(res.status).toBe(200);
      const list = (res.body as { data: { list: { action: string }[] } }).data
        .list;
      expect(list.map((r) => r.action)).toEqual(['ROOM_LEFT']);
    });

    it('沒有紀錄時回空列表', async () => {
      const res = await asFull(
        'get',
        `/api/admin/moderation/members/${offenderId}/timeline`,
      );

      expect((res.body as { data: { list: unknown[] } }).data.list).toEqual([]);
    });

    it('沒有 moderation 權限 → 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/admin/moderation/members/${offenderId}/timeline`)
        .set('Authorization', `Bearer ${tokenNone}`);

      expectForbidden(res);
    });
  });
});
