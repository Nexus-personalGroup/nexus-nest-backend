import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { PermissionCode } from '@app/domain/value-object/Role';
import { ResponseCodes } from '@app/shared/constants/response-codes';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember, seedUser } from '../helpers/db';
import {
  describeUnauthorized,
  expectApiError,
  expectForbidden,
} from '../helpers/assertions';

const PASSWORD = 'TestPass123!';
const USER_PASSWORD = 'User1234!';
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

type ListItem = {
  id: string;
  email: string;
  displayName: string;
  status: boolean;
  emailVerifiedAt: string | null;
};
type ListBody = { data: { list: ListItem[]; meta: { total: number } } };
type DetailBody = { data: ListItem };

/**
 * 後台的前台會員管理（e2e）。
 *
 * 重點有三個，而且都不是「列表會回東西」：
 * **(a) 三組權限互不相通**（這是新開權限碼的直接證據）、
 * **(b) 清單裡只有 `users` 沒有 `members`**、
 * **(c) 強制登出與停權不是同一件事**——前者不動 `status`。
 */
describe('FrontUser E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

  let tokenFull = '';
  let tokenViewOnly = '';
  let tokenModeration = '';
  let tokenAccount = '';
  let userId = '';
  let suspendedId = '';

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email, password: PASSWORD });
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  };

  const frontLogin = (email: string) =>
    request(app.getHttpServer())
      .post('/api/front/auth/login')
      .send({ email, password: USER_PASSWORD });

  const list = (query = '', token = tokenFull) =>
    request(app.getHttpServer())
      .get(`/api/admin/front-users${query}`)
      .set('Authorization', `Bearer ${token}`);

  const detail = (id: string, token = tokenFull) =>
    request(app.getHttpServer())
      .get(`/api/admin/front-users/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const act = (id: string, action: string, token = tokenFull) =>
    request(app.getHttpServer())
      .post(`/api/admin/front-users/${id}/${action}`)
      .set('Authorization', `Bearer ${token}`);

  const userRow = (id: string) =>
    prisma.userRecord.findUniqueOrThrow({ where: { id } });

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

    await seedMember(prisma, {
      email: 'full@test.com',
      password: PASSWORD,
      permissionCodes: [
        PermissionCode.BACKEND_FRONT_USER_VIEW,
        PermissionCode.BACKEND_FRONT_USER_EDIT,
      ],
    });
    await seedMember(prisma, {
      email: 'viewonly@test.com',
      password: PASSWORD,
      roleName: 'fu-view',
      permissionCodes: [PermissionCode.BACKEND_FRONT_USER_VIEW],
    });
    // 只有審閱權限 / 只有帳號權限——用來證明三組權限互不相通
    await seedMember(prisma, {
      email: 'moderator@test.com',
      password: PASSWORD,
      roleName: 'moderator',
      permissionCodes: [
        PermissionCode.BACKEND_MODERATION_VIEW,
        PermissionCode.BACKEND_MODERATION_EDIT,
      ],
    });
    await seedMember(prisma, {
      email: 'accountadmin@test.com',
      password: PASSWORD,
      roleName: 'account-admin',
      permissionCodes: [
        PermissionCode.BACKEND_ACCOUNT_VIEW,
        PermissionCode.BACKEND_ACCOUNT_EDIT,
      ],
    });

    const user = await seedUser(prisma, {
      email: 'active@test.com',
      password: USER_PASSWORD,
      displayName: '小明',
    });
    const suspended = await seedUser(prisma, {
      email: 'suspended@test.com',
      password: USER_PASSWORD,
      displayName: '小華',
      status: false,
    });
    userId = user.userId;
    suspendedId = suspended.userId;
    await prisma.userRecord.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date('2026-08-01T00:00:00.000Z') },
    });

    tokenFull = await login('full@test.com');
    tokenViewOnly = await login('viewonly@test.com');
    tokenModeration = await login('moderator@test.com');
    tokenAccount = await login('accountadmin@test.com');
  });

  describe('未授權存取', () => {
    describeUnauthorized(() => app, 'get', '/api/admin/front-users');
    describeUnauthorized(
      () => app,
      'post',
      `/api/admin/front-users/${MISSING_ID}/suspend`,
    );
  });

  /**
   * 新開一組權限碼的直接證據。
   *
   * 沿用 ACCOUNT 的話「能管後台同事帳號的人」自動能管客戶；
   * 沿用 MODERATION 的話「能查客戶名單的人」自動看得到被撤回的訊息內容。
   */
  describe('⭐ 三組權限互不相通', () => {
    it('只有 MODERATION → 403', async () => {
      expectForbidden(await list('', tokenModeration));
      expectForbidden(await detail(userId, tokenModeration));
      expectForbidden(await act(userId, 'suspend', tokenModeration));
    });

    it('只有 ACCOUNT → 403', async () => {
      expectForbidden(await list('', tokenAccount));
      expectForbidden(await detail(userId, tokenAccount));
      expectForbidden(await act(userId, 'suspend', tokenAccount));
    });

    it('只有 FRONT_USER:VIEW → 讀得到、寫不了', async () => {
      expect((await list()).status).toBe(200);
      expect((await detail(userId, tokenViewOnly)).status).toBe(200);
      expectForbidden(await act(userId, 'suspend', tokenViewOnly));
      expectForbidden(await act(userId, 'force-logout', tokenViewOnly));
      expect((await userRow(userId)).status).toBe(true);
    });
  });

  describe('列表', () => {
    /**
     * 查錯表的症狀是**一份看起來完全正常、只是列了另一群人的清單**——
     * 沒有錯誤、沒有徵兆。因此必須有一個同時存在兩張表的斷言。
     */
    it('⭐ 清單裡只有 users，沒有任何 members', async () => {
      const res = await list();

      const emails = (res.body as ListBody).data.list.map((row) => row.email);
      expect(emails.sort()).toEqual(['active@test.com', 'suspended@test.com']);
      expect(emails).not.toContain('full@test.com');
    });

    it('⭐ 回應不含 password', async () => {
      const res = await list();

      expect(JSON.stringify(res.body)).not.toContain('$2b$');
      expect(Object.keys((res.body as ListBody).data.list[0])).not.toContain(
        'password',
      );
    });

    it('依 createdAt 由新到舊', async () => {
      const res = await list();

      const ids = (res.body as ListBody).data.list.map((row) => row.id);
      expect(ids[0]).toBe(suspendedId);
    });

    it('email 模糊搜尋', async () => {
      const res = await list('?email=active');

      expect((res.body as ListBody).data.meta.total).toBe(1);
    });

    it('顯示名稱模糊搜尋', async () => {
      const res = await list('?displayName=小華');

      expect((res.body as ListBody).data.list[0].email).toBe(
        'suspended@test.com',
      );
    });

    it('verified=false 只回未驗證的', async () => {
      const res = await list('?verified=false');

      const { list: rows } = (res.body as ListBody).data;
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe('suspended@test.com');
    });

    it('條件取交集', async () => {
      const res = await list('?status=false&email=active');

      expect((res.body as ListBody).data.meta.total).toBe(0);
    });

    it('省略 status 即不過濾', async () => {
      const res = await list();

      expect((res.body as ListBody).data.meta.total).toBe(2);
    });

    it('status=yes → 400', async () => {
      const res = await list('?status=yes');

      expect(res.status).toBe(400);
    });

    it('軟刪除的帳號不出現', async () => {
      await prisma.userRecord.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      const res = await list();

      expect((res.body as ListBody).data.meta.total).toBe(1);
    });
  });

  describe('詳情', () => {
    it('回帳號面的欄位', async () => {
      const res = await detail(userId);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data as object).sort()).toEqual([
        'avatarUrl',
        'createdAt',
        'displayName',
        'email',
        'emailVerifiedAt',
        'id',
        'lastSeenAt',
        'status',
      ]);
      expect((res.body as DetailBody).data.emailVerifiedAt).not.toBeNull();
    });

    it('⭐ 傳入後台管理員的 ID → 404', async () => {
      const admin = await prisma.memberRecord.findFirstOrThrow({
        where: { email: 'full@test.com' },
      });

      const res = await detail(admin.id);

      expectApiError(res, 404, ResponseCodes.MEMBER_NOT_FOUND);
    });

    it('已軟刪除 → 404', async () => {
      await prisma.userRecord.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      expectApiError(await detail(userId), 404, ResponseCodes.MEMBER_NOT_FOUND);
    });
  });

  describe('停權與解除', () => {
    it('停權 → 204，帳號停用且 tokenVersion 遞增', async () => {
      const before = await userRow(userId);

      const res = await act(userId, 'suspend');

      expect(res.status).toBe(204);
      const after = await userRow(userId);
      expect(after.status).toBe(false);
      expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    });

    it('留下 MEMBER_SUSPENDED 稽核，執行者是管理員', async () => {
      await act(userId, 'suspend');

      const rows = await prisma.chatAuditLogRecord.findMany();
      expect(rows.map((r) => r.action)).toEqual(['MEMBER_SUSPENDED']);
      expect(rows[0].targetMemberId).toBe(userId);
    });

    it('重複停權 → 204 且不重複稽核', async () => {
      await act(userId, 'suspend');
      const res = await act(userId, 'suspend');

      expect(res.status).toBe(204);
      expect(await prisma.chatAuditLogRecord.count()).toBe(1);
    });

    it('解除 → 204 且帳號恢復', async () => {
      const res = await act(suspendedId, 'reinstate');

      expect(res.status).toBe(204);
      expect((await userRow(suspendedId)).status).toBe(true);
    });

    it('對未停權的帳號解除 → 204 且不寫稽核', async () => {
      const res = await act(userId, 'reinstate');

      expect(res.status).toBe(204);
      expect(await prisma.chatAuditLogRecord.count()).toBe(0);
    });

    /**
     * 兩個入口共用同一個 use case 的直接證據。
     * 各自實作會讓 tokenVersion / 稽核的行為分歧，而分歧的那一邊不會有人發現。
     */
    it('⭐ 與審閱側入口的效果完全一致', async () => {
      await seedMember(prisma, {
        email: 'mod2@test.com',
        password: PASSWORD,
        roleName: 'mod2',
        permissionCodes: [PermissionCode.BACKEND_MODERATION_EDIT],
      });
      const modToken = await login('mod2@test.com');
      const other = await seedUser(prisma, {
        email: 'other@test.com',
        password: USER_PASSWORD,
      });

      await act(userId, 'suspend').expect(204);
      await request(app.getHttpServer())
        .post(`/api/admin/moderation/members/${other.userId}/suspend`)
        .set('Authorization', `Bearer ${modToken}`)
        .expect(204);

      const viaFrontUser = await userRow(userId);
      const viaModeration = await userRow(other.userId);
      expect(viaFrontUser.status).toBe(viaModeration.status);
      expect(viaFrontUser.tokenVersion).toBe(viaModeration.tokenVersion);
      const actions = (await prisma.chatAuditLogRecord.findMany()).map(
        (r) => r.action,
      );
      expect(actions).toEqual(['MEMBER_SUSPENDED', 'MEMBER_SUSPENDED']);
    });

    it('使用者不存在 → 404', async () => {
      expectApiError(
        await act(MISSING_ID, 'suspend'),
        404,
        ResponseCodes.MEMBER_NOT_FOUND,
      );
    });
  });

  /**
   * 強制登出的核心：**它不是「停權再解除」**。
   * 用停權代替會在稽核裡留下一筆不實的違規紀錄。
   */
  describe('⭐ 強制登出', () => {
    it('舊 token 失效、帳號仍可用', async () => {
      const before = await frontLogin('active@test.com');
      const oldToken = (before.body as { data: { accessToken: string } }).data
        .accessToken;

      await act(userId, 'force-logout').expect(204);

      // 舊 token：tokenVersion 對不上 → 401
      await request(app.getHttpServer())
        .get('/api/front/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(401);
      // 帳號沒被停用，重新登入就能繼續用
      const after = await frontLogin('active@test.com');
      expect(after.status).toBe(200);
    });

    it('⭐ 不改變 status', async () => {
      await act(userId, 'force-logout').expect(204);

      expect((await userRow(userId)).status).toBe(true);
    });

    it('⭐ 稽核是 MEMBER_FORCE_LOGGED_OUT，不是 MEMBER_SUSPENDED', async () => {
      await act(userId, 'force-logout');

      const rows = await prisma.chatAuditLogRecord.findMany();
      expect(rows.map((r) => r.action)).toEqual(['MEMBER_FORCE_LOGGED_OUT']);
      expect(rows[0].targetMemberId).toBe(userId);
    });

    it('對已停權的帳號同樣有效', async () => {
      const before = await userRow(suspendedId);

      const res = await act(suspendedId, 'force-logout');

      expect(res.status).toBe(204);
      const after = await userRow(suspendedId);
      expect(after.tokenVersion).toBe(before.tokenVersion + 1);
      expect(after.status).toBe(false);
    });

    it('⭐ 刻意不冪等：連兩次遞增兩次、稽核兩筆', async () => {
      const before = await userRow(userId);

      await act(userId, 'force-logout').expect(204);
      await act(userId, 'force-logout').expect(204);

      expect((await userRow(userId)).tokenVersion).toBe(
        before.tokenVersion + 2,
      );
      expect(await prisma.chatAuditLogRecord.count()).toBe(2);
    });

    it('使用者不存在 → 404', async () => {
      expectApiError(
        await act(MISSING_ID, 'force-logout'),
        404,
        ResponseCodes.MEMBER_NOT_FOUND,
      );
    });
  });
});
