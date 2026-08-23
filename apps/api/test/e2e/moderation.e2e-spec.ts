import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { ResponseCodes } from '@app/shared/constants/response-codes';
import { PermissionCode } from '@app/domain/value-object/Role';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember, seedUser } from '../helpers/db';
import {
  describeUnauthorized,
  expectApiError,
  expectForbidden,
} from '../helpers/assertions';

const PASSWORD = 'TestPass123!';
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';
const SNAPSHOT = '被檢舉時的訊息內容';

type ListItem = {
  reportId: string;
  reporterId: string;
  reporterEmail: string | null;
  targetMemberEmail: string | null;
};
type ListBody = { data: { list: ListItem[] } };
type DetailBody = {
  data: {
    contentSnapshot?: string;
    reportId: string;
    reporterEmail: string | null;
    targetMemberEmail: string | null;
    targetMessageRemovedAt: string | null;
  };
};

describe('Moderation E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

  // 三種身分：全權限、只有 VIEW、完全沒有 moderation 權限
  let tokenFull = '';
  let tokenViewOnly = '';
  /** 帳號管理側的權限——用來驗證兩個入口效果一致 */
  let tokenAccount = '';
  let tokenNone = '';
  // 後台管理員：稽核裡的**執行者**永遠是他
  let adminId = '';
  // 前台使用者：檢舉人。當事人一律是前台使用者，不是管理員
  let reporterId = '';
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
      email: 'accountadmin@test.com',
      password: PASSWORD,
      roleName: 'account-admin',
      permissionCodes: [PermissionCode.BACKEND_ACCOUNT_EDIT],
    });
    await seedMember(prisma, {
      email: 'viewer@test.com',
      password: PASSWORD,
      roleName: 'viewer',
      permissionCodes: [PermissionCode.BACKEND_MODERATION_VIEW],
    });
    // 只有帳號權限、沒有審閱權限的後台帳號——用來驗 403
    await seedMember(prisma, {
      email: 'nopriv@test.com',
      password: PASSWORD,
      roleName: 'nopriv',
      permissionCodes: ['BACKEND:ACCOUNT:VIEW'],
    });
    // 檢舉的兩造都是**前台使用者**
    const offender = await seedUser(prisma, {
      email: 'offender@test.com',
      password: PASSWORD,
    });
    const reporter = await seedUser(prisma, {
      email: 'reporter@test.com',
      password: PASSWORD,
    });
    adminId = admin.memberId;
    offenderId = offender.userId;
    reporterId = reporter.userId;
    tokenFull = await login('admin@test.com');
    tokenViewOnly = await login('viewer@test.com');
    tokenAccount = await login('accountadmin@test.com');
    tokenNone = await login('nopriv@test.com');

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
        reporterId,
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

    it('帶出兩造的 email', async () => {
      const res = await asFull('get', '/api/admin/moderation/reports');

      const [row] = (res.body as ListBody).data.list;
      expect(row.reporterEmail).toBe('reporter@test.com');
      expect(row.targetMemberEmail).toBe('offender@test.com');
    });

    /**
     * 補 email 查的是 `users`，不是 `members`。
     *
     * 用「拿一個只存在於 `members` 的 ID 當檢舉人」來證明：如果實作查錯表，
     * 這裡會回那個管理員的 email。這是本 change 在審閱側最直接的證據——
     * 而查錯表的症狀是**所有 email 都變成 null**，看起來像「帳號全被刪了」，
     * 不會有任何錯誤。
     */
    it('⭐ 檢舉人是只存在於 members 的 ID → email 為 null', async () => {
      const message = await prisma.chatMessageRecord.findFirstOrThrow({
        where: { senderId: offenderId },
      });
      await prisma.chatReportRecord.create({
        data: {
          reporterId: adminId,
          targetMessageId: message.id,
          targetMemberId: offenderId,
          roomId: message.roomId,
          reason: 'SPAM',
          contentSnapshot: SNAPSHOT,
        },
      });

      const res = await asFull('get', '/api/admin/moderation/reports');

      const rows = (res.body as ListBody).data.list;
      const byAdmin = rows.find((row) => row.reporterId === adminId);
      expect(byAdmin?.reporterEmail).toBeNull();
      // 對照組：同一份回應裡，前台使用者的 email 補得出來
      expect(
        rows.find((row) => row.reporterId === reporterId)?.reporterEmail,
      ).toBe('reporter@test.com');
    });

    // chat_reports 刻意不建外鍵，正是為了帳號消失後檢舉仍可審閱
    it('⭐ 被檢舉人的帳號已刪除 → email 為 null，該筆仍在列表中', async () => {
      await prisma.userRecord.update({
        where: { id: offenderId },
        data: { deletedAt: new Date() },
      });

      const res = await asFull('get', '/api/admin/moderation/reports');

      const [row] = (res.body as ListBody).data.list;
      expect(row.targetMemberEmail).toBeNull();
      expect(row.reporterEmail).toBe('reporter@test.com');
    });

    /**
     * 本端點的授權是 `BACKEND:MODERATION:VIEW`，不是 `BACKEND:ACCOUNT:VIEW`。
     *
     * 補 email 是為了讓審閱者辨識當事人；順手把角色、狀態、最後登入時間
     * 一起帶出來就是在繞過帳號管理的權限邊界，而那種洩漏在 code review 時
     * 看起來只是「多回幾個欄位」。
     */
    it('⭐ 只帶 email，不帶其他帳號資料', async () => {
      const res = await asFull('get', '/api/admin/moderation/reports');

      const [row] = (res.body as ListBody).data.list;
      expect(Object.keys(row).sort()).toEqual([
        'createdAt',
        'reason',
        'reportId',
        'reporterEmail',
        'reporterId',
        'roomId',
        'status',
        'targetMemberEmail',
        'targetMemberId',
      ]);
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

    it('詳情同樣帶出兩造的 email', async () => {
      const res = await asFull(
        'get',
        `/api/admin/moderation/reports/${reportId}`,
      );

      expect((res.body as DetailBody).data.reporterEmail).toBe(
        'reporter@test.com',
      );
      expect((res.body as DetailBody).data.targetMemberEmail).toBe(
        'offender@test.com',
      );
    });

    // 介面依這個欄位二選一顯示「移除」或「還原」，兩者不可同時出現
    it('⭐ 訊息被移除前後，targetMessageRemovedAt 從 null 變成時間戳', async () => {
      const before = await asFull(
        'get',
        `/api/admin/moderation/reports/${reportId}`,
      );
      expect(
        (before.body as DetailBody).data.targetMessageRemovedAt,
      ).toBeNull();

      await prisma.chatMessageRecord.updateMany({
        where: { senderId: offenderId },
        data: { removedAt: new Date(), removedBy: adminId },
      });

      const after = await asFull(
        'get',
        `/api/admin/moderation/reports/${reportId}`,
      );
      expect(
        (after.body as DetailBody).data.targetMessageRemovedAt,
      ).not.toBeNull();
    });

    // 檢舉的快照本來就不依賴訊息是否還在
    it('訊息已不存在 → targetMessageRemovedAt 為 null 且詳情照常回傳', async () => {
      await prisma.chatMessageRecord.deleteMany({
        where: { senderId: offenderId },
      });

      const res = await asFull(
        'get',
        `/api/admin/moderation/reports/${reportId}`,
      );

      expect(res.status).toBe(200);
      expect((res.body as DetailBody).data.targetMessageRemovedAt).toBeNull();
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

  describe('聊天室總覽', () => {
    type RoomListBody = {
      data: {
        list: {
          roomId: string;
          roomType: string;
          name: string | null;
          memberCount: number;
          messageCount: number;
        }[];
        meta: { total: number };
      };
    };
    type RoomDetailBody = {
      data: {
        members: { memberId: string; email: string | null }[];
        messageCount: number;
      };
    };

    const listRooms = (query = '', token = tokenFull) =>
      request(app.getHttpServer())
        .get(`/api/admin/moderation/rooms${query}`)
        .set('Authorization', `Bearer ${token}`);

    const roomDetail = (id: string, token = tokenFull) =>
      request(app.getHttpServer())
        .get(`/api/admin/moderation/rooms/${id}`)
        .set('Authorization', `Bearer ${token}`);

    /** beforeEach 已建了一個群組（審閱測試房間），這裡再補一個私聊 */
    const seedDirect = () =>
      prisma.chatRoomRecord.create({
        data: {
          roomType: 'DIRECT',
          directKey: `${reporterId}:${offenderId}`,
          members: {
            create: [{ memberId: reporterId }, { memberId: offenderId }],
          },
        },
      });

    it('列出全部房間，私聊的 name 為 null', async () => {
      await seedDirect();

      const res = await listRooms();

      expect(res.status).toBe(200);
      const { list } = (res.body as RoomListBody).data;
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.find((room) => room.roomType === 'DIRECT')?.name).toBeNull();
    });

    it('roomType 篩選各自只回對應類型', async () => {
      await seedDirect();

      const groups = await listRooms('?roomType=GROUP');
      const directs = await listRooms('?roomType=DIRECT');

      expect(
        (groups.body as RoomListBody).data.list.every(
          (room) => room.roomType === 'GROUP',
        ),
      ).toBe(true);
      expect(
        (directs.body as RoomListBody).data.list.every(
          (room) => room.roomType === 'DIRECT',
        ),
      ).toBe(true);
    });

    /**
     * `messageCount` 的語意是**歷史累計**，不是「目前存在幾則」。
     *
     * 它取自 `chat_rooms.last_seq`——訊息列永遠不會被刪除，撤回與移除都只是打標記。
     * 改成 `count(*)` 的話這支測試仍會過（因為列還在），
     * 但語意會在日後真的做訊息清理時悄悄改變。
     */
    it('⭐ 撤回與移除的訊息仍計入 messageCount', async () => {
      const room = await prisma.chatRoomRecord.create({
        data: { roomType: 'GROUP', name: '計數測試房', lastSeq: 3 },
      });
      await prisma.chatMessageRecord.createMany({
        data: [
          {
            roomId: room.id,
            senderId: offenderId,
            content: '第一則',
            seq: 1,
            clientMessageId: 'm-1',
            retractedAt: new Date(),
            retractedBy: offenderId,
          },
          {
            roomId: room.id,
            senderId: offenderId,
            content: '第二則',
            seq: 2,
            clientMessageId: 'm-2',
            removedAt: new Date(),
            removedBy: adminId,
          },
          {
            roomId: room.id,
            senderId: offenderId,
            content: '第三則',
            seq: 3,
            clientMessageId: 'm-3',
          },
        ],
      });

      const res = await roomDetail(room.id);

      expect((res.body as RoomDetailBody).data.messageCount).toBe(3);
    });

    it('詳情的成員清單含 email', async () => {
      const direct = await seedDirect();

      const res = await roomDetail(direct.id);

      expect(res.status).toBe(200);
      const { members } = (res.body as RoomDetailBody).data;
      expect(members).toHaveLength(2);
      expect(members.map((member) => member.email).sort()).toEqual([
        'offender@test.com',
        'reporter@test.com',
      ]);
    });

    // 帳號刪除不該讓成員從房間裡消失——那會讓成員數與清單長度對不起來
    it('成員的帳號已刪除 → email 為 null 且仍在清單中', async () => {
      const direct = await seedDirect();
      await prisma.userRecord.update({
        where: { id: offenderId },
        data: { deletedAt: new Date() },
      });

      const res = await roomDetail(direct.id);

      const { members } = (res.body as RoomDetailBody).data;
      expect(members).toHaveLength(2);
      expect(members.filter((member) => member.email === null)).toHaveLength(1);
    });

    /**
     * 房間總覽**不是內容存取路徑**。
     *
     * 這是這個 change 最重要的一條界線：看得到房間訊息是實質擴權，
     * 從「有人檢舉才看得到那一句」變成「能瀏覽任何房間的對話」。
     */
    it('⭐ 列表與詳情都不含訊息內容', async () => {
      const list = await listRooms();
      const detail = await roomDetail(
        (list.body as RoomListBody).data.list[0].roomId,
      );

      expect(JSON.stringify(list.body)).not.toContain(SNAPSHOT);
      expect(JSON.stringify(detail.body)).not.toContain(SNAPSHOT);
    });

    it('房間不存在 → 404', async () => {
      const res = await roomDetail(MISSING_ID);

      expectApiError(res, 404, ResponseCodes.CHAT_ROOM_NOT_FOUND);
    });

    it('只有 ACCOUNT:VIEW → 兩支都 403', async () => {
      expectForbidden(await listRooms('', tokenNone));
      expectForbidden(await roomDetail(MISSING_ID, tokenNone));
    });
  });

  describe('成員概覽', () => {
    const profile = (id: string, token = tokenFull) =>
      request(app.getHttpServer())
        .get(`/api/admin/moderation/members/${id}`)
        .set('Authorization', `Bearer ${token}`);

    type ProfileBody = {
      data: {
        reportedCount: number;
        submittedReportCount: number;
        roomCount: number;
        isOnline: boolean;
        status: boolean;
      };
    };

    it('回傳被檢舉與提出檢舉的次數', async () => {
      const target = await profile(offenderId);
      const reporter = await profile(reporterId);

      expect(target.status).toBe(200);
      expect((target.body as ProfileBody).data.reportedCount).toBe(1);
      expect((target.body as ProfileBody).data.submittedReportCount).toBe(0);
      expect((reporter.body as ProfileBody).data.reportedCount).toBe(0);
      expect((reporter.body as ProfileBody).data.submittedReportCount).toBe(1);
    });

    /**
     * 用 `Object.keys().sort()` 而非 `objectContaining`。
     *
     * 後者抓不到「多回了角色」，而那正是這裡最該擋的事：本端點的授權是
     * `BACKEND:MODERATION:VIEW`，帶出帳號管理的資料等於繞過
     * `BACKEND:ACCOUNT:VIEW` 的邊界。而「反正都查回來了順手全回」
     * 在 code review 時看起來只是「多回幾個欄位」。
     */
    it('⭐ 只回審閱需要的八個欄位，不含角色與權限', async () => {
      const res = await profile(offenderId);

      expect(Object.keys(res.body.data as object).sort()).toEqual([
        'email',
        'isOnline',
        'joinedAt',
        'memberId',
        'reportedCount',
        'roomCount',
        'status',
        'submittedReportCount',
      ]);
    });

    it('反映停權狀態', async () => {
      await prisma.userRecord.update({
        where: { id: offenderId },
        data: { status: false },
      });

      const res = await profile(offenderId);

      expect((res.body as ProfileBody).data.status).toBe(false);
    });

    it('計入所在的聊天室數', async () => {
      const room = await prisma.chatRoomRecord.create({
        data: {
          roomType: 'GROUP',
          name: '概覽測試房',
          members: { create: [{ memberId: offenderId }] },
        },
      });

      const res = await profile(offenderId);

      expect((res.body as ProfileBody).data.roomCount).toBe(1);
      expect(room.id).toBeTruthy();
    });

    // 回應不含任何訊息內容，記了會讓稽核量與「點了幾下」對齊
    it('⭐ 查概覽不寫任何稽核', async () => {
      await profile(offenderId);
      await profile(reporterId);

      expect(await auditRows()).toHaveLength(0);
    });

    it('成員不存在 → 404', async () => {
      const res = await profile(MISSING_ID);

      expectApiError(res, 404, ResponseCodes.MEMBER_NOT_FOUND);
    });

    it('已軟刪除的成員 → 404', async () => {
      await prisma.userRecord.update({
        where: { id: offenderId },
        data: { deletedAt: new Date() },
      });

      const res = await profile(offenderId);

      expectApiError(res, 404, ResponseCodes.MEMBER_NOT_FOUND);
    });

    // 只有帳號管理權限的人不該看得到審閱視角的資料
    it('只有 ACCOUNT:VIEW → 403', async () => {
      const res = await profile(offenderId, tokenNone);

      expectForbidden(res);
    });
  });

  describe('成員所在的聊天室', () => {
    type RoomsBody = {
      data: { list: { name: string | null; memberCount: number }[] };
    };

    const rooms = (id: string, token = tokenFull) =>
      request(app.getHttpServer())
        .get(`/api/admin/moderation/members/${id}/rooms`)
        .set('Authorization', `Bearer ${token}`);

    it('回傳該成員所在的房間', async () => {
      await prisma.chatRoomRecord.create({
        data: {
          roomType: 'GROUP',
          name: '午餐團',
          members: { create: [{ memberId: offenderId }] },
        },
      });

      const res = await rooms(offenderId);

      expect(res.status).toBe(200);
      const { list } = (res.body as RoomsBody).data;
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('午餐團');
      expect(list[0].memberCount).toBe(1);
    });

    // 私聊的顯示名由對方決定、不落庫，因此後端回 null 由前端決定怎麼顯示
    it('私聊的 name 為 null', async () => {
      await prisma.chatRoomRecord.create({
        data: {
          roomType: 'DIRECT',
          directKey: `${reporterId}:${offenderId}`,
          members: { create: [{ memberId: offenderId }] },
        },
      });

      const res = await rooms(offenderId);

      expect((res.body as RoomsBody).data.list[0].name).toBeNull();
    });

    it('不在任何房間 → 空列表', async () => {
      const res = await rooms(offenderId);

      expect(res.status).toBe(200);
      expect((res.body as RoomsBody).data.list).toEqual([]);
    });

    it('只有 ACCOUNT:VIEW → 403', async () => {
      const res = await rooms(offenderId, tokenNone);

      expectForbidden(res);
    });
  });

  describe('成員相關檢舉', () => {
    type MemberReportsBody = {
      data: {
        list: { reportId: string; counterpartEmail: string | null }[];
        meta: { total: number };
      };
    };

    const memberReports = (id: string, role?: string, token = tokenFull) =>
      request(app.getHttpServer())
        .get(
          `/api/admin/moderation/members/${id}/reports${
            role ? `?role=${role}` : ''
          }`,
        )
        .set('Authorization', `Bearer ${token}`);

    it('預設回被檢舉的方向，對造是檢舉人', async () => {
      const res = await memberReports(offenderId);

      expect(res.status).toBe(200);
      const { list } = (res.body as MemberReportsBody).data;
      expect(list).toHaveLength(1);
      expect(list[0].counterpartEmail).toBe('reporter@test.com');
    });

    it('role=REPORTER 回提出的檢舉，對造是被檢舉人', async () => {
      const res = await memberReports(reporterId, 'REPORTER');

      const { list } = (res.body as MemberReportsBody).data;
      expect(list).toHaveLength(1);
      expect(list[0].counterpartEmail).toBe('offender@test.com');
    });

    // 兩個方向必須分開：合併會讓「他被檢舉」與「他檢舉別人」的計數混在一起
    it('⭐ 兩個方向各自只回對應的檢舉', async () => {
      const asTarget = await memberReports(offenderId, 'TARGET');
      const asReporter = await memberReports(offenderId, 'REPORTER');

      expect((asTarget.body as MemberReportsBody).data.meta.total).toBe(1);
      expect((asReporter.body as MemberReportsBody).data.meta.total).toBe(0);
    });

    it('對造帳號已刪除 → counterpartEmail 為 null，該筆仍在列表中', async () => {
      await prisma.userRecord.update({
        where: { id: offenderId },
        data: { deletedAt: new Date() },
      });

      const res = await memberReports(reporterId, 'REPORTER');

      const { list } = (res.body as MemberReportsBody).data;
      expect(list).toHaveLength(1);
      expect(list[0].counterpartEmail).toBeNull();
    });

    it('⭐ 列表不含 contentSnapshot', async () => {
      const res = await memberReports(offenderId);

      expect(JSON.stringify(res.body)).not.toContain(SNAPSHOT);
    });

    it('非法的 role → 400', async () => {
      const res = await memberReports(offenderId, 'WHATEVER');

      expect(res.status).toBe(400);
    });

    it('只有 ACCOUNT:VIEW → 403', async () => {
      const res = await memberReports(offenderId, undefined, tokenNone);

      expectForbidden(res);
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

  /**
   * 移除與還原。
   *
   * 核心是**移除與撤回必須分得開**：共用欄位會讓發送者以為自己撤回了（他沒有），
   * 也讓後台無法統計「被移除幾則」。
   */
  describe('移除訊息', () => {
    let messageId = '';

    const remove = (id = messageId, token = tokenFull) =>
      request(app.getHttpServer())
        .delete(`/api/admin/moderation/messages/${id}`)
        .set('Authorization', `Bearer ${token}`);

    const restore = (id = messageId, token = tokenFull) =>
      request(app.getHttpServer())
        .post(`/api/admin/moderation/messages/${id}/restore`)
        .set('Authorization', `Bearer ${token}`);

    const messageRow = () =>
      prisma.chatMessageRecord.findUniqueOrThrow({ where: { id: messageId } });

    beforeEach(async () => {
      const message = await prisma.chatMessageRecord.findFirstOrThrow({
        where: { senderId: offenderId },
      });
      messageId = message.id;
      // 讓被檢舉者成為房間成員，才查得到歷史
      await prisma.chatRoomMemberRecord.createMany({
        data: [
          { roomId: message.roomId, memberId: reporterId },
          { roomId: message.roomId, memberId: offenderId },
        ],
        skipDuplicates: true,
      });
    });

    it('移除 → 204 並標記 removedAt', async () => {
      const res = await remove();

      expect(res.status).toBe(204);
      const row = await messageRow();
      expect(row.removedAt).not.toBeNull();
      expect(row.removedBy).toBe(adminId);
    });

    // 移除的訊息正是最需要留下證據的那些
    it('內容仍保留在資料庫', async () => {
      await remove();

      expect((await messageRow()).content).toBe(SNAPSHOT);
    });

    // ⭐ 本 change 的核心：兩者必須分得開
    it('⭐ 移除不會設定 retractedAt', async () => {
      await remove();

      expect((await messageRow()).retractedAt).toBeNull();
    });

    it('已被使用者撤回的訊息仍可移除，兩個標記同時存在', async () => {
      await prisma.chatMessageRecord.update({
        where: { id: messageId },
        data: { retractedAt: new Date(), retractedBy: offenderId },
      });

      await remove();

      const row = await messageRow();
      expect(row.retractedAt).not.toBeNull();
      expect(row.removedAt).not.toBeNull();
    });

    it('重複移除 → 204 且不覆寫移除時間', async () => {
      await remove();
      const first = await messageRow();

      const res = await remove();

      expect(res.status).toBe(204);
      expect((await messageRow()).removedAt).toEqual(first.removedAt);
    });

    it('只有 VIEW 權限 → 403', async () => {
      const res = await remove(messageId, tokenViewOnly);

      expectForbidden(res);
      expect((await messageRow()).removedAt).toBeNull();
    });

    it('訊息不存在 → 404', async () => {
      const res = await remove(MISSING_ID);
      expectApiError(res, 404, ResponseCodes.CHAT_MESSAGE_NOT_FOUND);
    });

    it('移除與還原各留一筆稽核', async () => {
      await remove();
      await restore();

      const rows = await prisma.chatAuditLogRecord.findMany({
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => r.action)).toEqual([
        'MESSAGE_REMOVED',
        'MESSAGE_RESTORED',
      ]);
    });

    describe('還原', () => {
      it('⭐ 還原後 removedAt 清除', async () => {
        await remove();
        const res = await restore();

        expect(res.status).toBe(204);
        const row = await messageRow();
        expect(row.removedAt).toBeNull();
        expect(row.removedBy).toBeNull();
      });

      // 若原本已被發送者撤回，還原後應回到「已收回」而非完全正常
      it('⭐ 還原不碰 retractedAt', async () => {
        await prisma.chatMessageRecord.update({
          where: { id: messageId },
          data: { retractedAt: new Date(), retractedBy: offenderId },
        });
        await remove();

        await restore();

        const row = await messageRow();
        expect(row.removedAt).toBeNull();
        expect(row.retractedAt).not.toBeNull();
      });

      it('還原未被移除的訊息 → 204 且無變化', async () => {
        const res = await restore();

        expect(res.status).toBe(204);
        expect(await prisma.chatAuditLogRecord.count()).toBe(0);
      });

      it('只有 VIEW 權限 → 403', async () => {
        await remove();
        const res = await restore(messageId, tokenViewOnly);

        expectForbidden(res);
        expect((await messageRow()).removedAt).not.toBeNull();
      });
    });
  });

  /**
   * 停權與解除（審閱側入口）。
   *
   * **停的是前台使用者（`users`），與帳號管理的 `PATCH /api/admin/members/:id`
   * 是兩支不同的 use case。** 兩者停的東西不同：審閱處理的是聊天裡的違規行為，
   * 而聊天的參與者是前台使用者——停一個管理員的後台帳號對違規行為沒有作用。
   */
  describe('停權', () => {
    const suspend = (id = offenderId, token = tokenFull) =>
      request(app.getHttpServer())
        .post(`/api/admin/moderation/members/${id}/suspend`)
        .set('Authorization', `Bearer ${token}`);

    const reinstate = (id = offenderId, token = tokenFull) =>
      request(app.getHttpServer())
        .post(`/api/admin/moderation/members/${id}/reinstate`)
        .set('Authorization', `Bearer ${token}`);

    const userRow = () =>
      prisma.userRecord.findUniqueOrThrow({ where: { id: offenderId } });

    it('停權 → 204 且帳號停用', async () => {
      const res = await suspend();

      expect(res.status).toBe(204);
      expect((await userRow()).status).toBe(false);
    });

    it('停權留下 MEMBER_SUSPENDED 稽核', async () => {
      await suspend();

      const rows = await prisma.chatAuditLogRecord.findMany();
      expect(rows.map((r) => r.action)).toEqual(['MEMBER_SUSPENDED']);
      expect(rows[0].memberId).toBe(adminId);
      expect(rows[0].targetMemberId).toBe(offenderId);
    });

    it('解除 → 204 且帳號恢復，留下 MEMBER_REINSTATED', async () => {
      await suspend();
      const res = await reinstate();

      expect(res.status).toBe(204);
      expect((await userRow()).status).toBe(true);
      const rows = await prisma.chatAuditLogRecord.findMany({
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => r.action)).toEqual([
        'MEMBER_SUSPENDED',
        'MEMBER_REINSTATED',
      ]);
    });

    // 對已停用的帳號重複停權不該重複斷線或重複稽核
    it('重複停權 → 204 且不重複稽核', async () => {
      await suspend();
      const res = await suspend();

      expect(res.status).toBe(204);
      expect(await prisma.chatAuditLogRecord.count()).toBe(1);
    });

    it('對未停用的帳號解除 → 204 且不寫稽核', async () => {
      const res = await reinstate();

      expect(res.status).toBe(204);
      expect(await prisma.chatAuditLogRecord.count()).toBe(0);
    });

    it('只有 VIEW 權限 → 403', async () => {
      const res = await suspend(offenderId, tokenViewOnly);

      expectForbidden(res);
      expect((await userRow()).status).toBe(true);
    });

    /**
     * **行為已改變**：`migrate-chat-to-front-users` 之前這裡回 409
     * （沿用帳號管理的 CannotDisableSelfException）。
     *
     * 現在管理員的 ID 在 `users` 裡查不到，所以它就只是一個不存在的 ID。
     * 「不可停權自己」的保護在這一側已經沒有意義——兩個身分空間不相交，
     * 管理員不可能是自己要停權的那個前台使用者。帳號管理側的保護保留不動。
     */
    it('⭐ 傳入自己（管理員）的 ID → 404 而非 409，且後台帳號不受影響', async () => {
      const res = await suspend(adminId);

      expect(res.status).toBe(404);
      const admin = await prisma.memberRecord.findUniqueOrThrow({
        where: { id: adminId },
      });
      expect(admin.status).toBe(true);
    });

    it('成員不存在 → 404', async () => {
      const res = await suspend(MISSING_ID);
      expect(res.status).toBe(404);
    });

    /**
     * 兩個入口停的是**兩張不同的表**。
     *
     * 這是本 change 最直接的證據：同一個 email 在兩張表各有一個帳號時，
     * 審閱側停的是 `users` 那個，帳號管理側停的是 `members` 那個。
     * 共用一支 use case 再用參數分流的話，傳錯參數就會停錯人而且沒有任何錯誤訊息。
     */
    it('⭐ 審閱側停權不影響同名的後台帳號', async () => {
      const twin = await seedMember(prisma, {
        email: 'offender@test.com',
        password: PASSWORD,
        roleName: 'twin',
      });

      await suspend().expect(204);

      expect((await userRow()).status).toBe(false);
      const member = await prisma.memberRecord.findUniqueOrThrow({
        where: { id: twin.memberId },
      });
      expect(member.status).toBe(true);
    });

    // 帳號管理側停的是後台帳號，寫的是同一種稽核動作但對象不同
    it('帳號管理側停用後台帳號 → 同樣寫 MEMBER_SUSPENDED', async () => {
      const twin = await seedMember(prisma, {
        email: 'twin@test.com',
        password: PASSWORD,
        roleName: 'twin2',
      });

      await request(app.getHttpServer())
        .patch(`/api/admin/members/${twin.memberId}`)
        .set('Authorization', `Bearer ${tokenAccount}`)
        .send({ status: false })
        .expect(204);

      const rows = await prisma.chatAuditLogRecord.findMany();
      expect(rows.map((r) => r.action)).toEqual(['MEMBER_SUSPENDED']);
      expect(rows[0].targetMemberId).toBe(twin.memberId);
    });
  });
});
