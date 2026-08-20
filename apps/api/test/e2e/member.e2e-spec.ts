import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember, seedRole } from '../helpers/db';
import {
  expectApiError,
  expectUnauthorized,
  expectForbidden,
} from '../helpers/assertions';
import { ResponseCodes } from '@app/shared/constants/response-codes';

// 走真 test DB:beforeEach seed 一個帶 ACCOUNT:VIEW/EDIT 的 admin 並登入；
// 無權限測試另 seed 空權限會員；目標會員以 prisma 直接建，斷言查真 DB。
const AUTH_EMAIL = 'auth@example.com';
const PASSWORD = 'TestPass123!';
const ACCOUNT_PERMS = ['BACKEND:ACCOUNT:VIEW', 'BACKEND:ACCOUNT:EDIT'];
const MISSING_ID = '00000000-0000-4000-8000-000000000099';

describe('Member E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminId: string;
  let roleId: string;
  const mockRedis = createMockRedis();

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email, password: PASSWORD });
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  };

  const loginNoPerm = async (): Promise<string> => {
    await seedMember(prisma, {
      email: 'noperm@example.com',
      password: PASSWORD,
      roleName: 'guest',
      permissionCodes: [],
    });
    return login('noperm@example.com');
  };

  const createTargetMember = (
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string }> =>
    prisma.memberRecord.create({
      data: {
        member: 'Target User',
        email: 'target@example.com',
        password: 'hashed',
        roleId,
        status: true,
        isDefault: false,
        ...overrides,
      },
    });

  const get = (url: string, token = () => adminToken) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token()}`);
  const post = (
    url: string,
    body: Record<string, unknown>,
    token = () => adminToken,
  ) =>
    request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${token()}`)
      .send(body);
  const patch = (url: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
  const del = (url: string) =>
    request(app.getHttpServer())
      .delete(url)
      .set('Authorization', `Bearer ${adminToken}`);

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
      email: AUTH_EMAIL,
      password: PASSWORD,
      roleName: 'admin',
      permissionCodes: ACCOUNT_PERMS,
    });
    adminId = admin.memberId;
    roleId = admin.roleId;
    adminToken = await login(AUTH_EMAIL);
  });

  describe('GET /api/admin/members', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/admin/members');
      expectUnauthorized(res);
    });

    it('有 JWT + VIEW → 200 + 列表含目標', async () => {
      await createTargetMember();
      const res = await get('/api/admin/members');
      expect(res.status).toBe(200);
      const emails = (
        res.body as { data: { list: Array<{ email: string }> } }
      ).data.list.map((m) => m.email);
      expect(emails).toContain('target@example.com');
    });

    it('無 ACCOUNT:VIEW 權限 → 403', async () => {
      const token = await loginNoPerm();
      const res = await get('/api/admin/members', () => token);
      expectForbidden(res);
    });

    it('status=true → 只回啟用會員', async () => {
      await createTargetMember({ email: 'active@example.com', status: true });
      await createTargetMember({
        email: 'inactive@example.com',
        status: false,
      });
      const res = await get('/api/admin/members?status=true');
      expect(res.status).toBe(200);
      const emails = (
        res.body as { data: { list: Array<{ email: string }> } }
      ).data.list.map((m) => m.email);
      expect(emails).toContain('active@example.com');
      expect(emails).not.toContain('inactive@example.com');
    });

    it('status=false → 只回停用會員', async () => {
      await createTargetMember({ email: 'active@example.com', status: true });
      await createTargetMember({
        email: 'inactive@example.com',
        status: false,
      });
      const res = await get('/api/admin/members?status=false');
      expect(res.status).toBe(200);
      const emails = (
        res.body as { data: { list: Array<{ email: string }> } }
      ).data.list.map((m) => m.email);
      expect(emails).toContain('inactive@example.com');
      expect(emails).not.toContain('active@example.com');
    });

    it('status=foo（非合法 enum）→ 400', async () => {
      const res = await get('/api/admin/members?status=foo');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/members/role/options', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/admin/members/role/options',
      );
      expectUnauthorized(res);
    });

    it('預設分頁 → 200 + { list, meta }', async () => {
      const res = await get('/api/admin/members/role/options');
      expect(res.status).toBe(200);
      const body = res.body as {
        data: {
          list: Array<{ id: string; name: string; isAssignable: boolean }>;
          meta: { page: number; limit: number };
        };
      };
      expect(body.data.meta.page).toBe(1);
      expect(body.data.meta.limit).toBe(20);
      expect(body.data.list.some((r) => r.isAssignable)).toBe(true);
    });

    it('roleCode=SUPERADMIN → 該角色 isAssignable: false', async () => {
      await seedRole(prisma, { name: '超級管理員', permissionCodes: [] });
      await prisma.role.updateMany({
        where: { name: '超級管理員' },
        data: { roleCode: 'SUPERADMIN' },
      });
      const res = await get('/api/admin/members/role/options');
      expect(res.status).toBe(200);
      const superRole = (
        res.body as {
          data: { list: Array<{ name: string; isAssignable: boolean }> };
        }
      ).data.list.find((r) => r.name === '超級管理員');
      expect(superRole?.isAssignable).toBe(false);
    });

    it('指定 page / limit → meta 反映', async () => {
      const res = await get('/api/admin/members/role/options?page=2&limit=10');
      expect(res.status).toBe(200);
      const meta = (
        res.body as { data: { meta: { page: number; limit: number } } }
      ).data.meta;
      expect(meta.page).toBe(2);
      expect(meta.limit).toBe(10);
    });

    it('search 命中 → 只回名稱含關鍵字的角色', async () => {
      await seedRole(prisma, { name: 'searchable-admin', permissionCodes: [] });
      await seedRole(prisma, { name: 'other-role', permissionCodes: [] });
      const res = await get(
        '/api/admin/members/role/options?search=searchable',
      );
      expect(res.status).toBe(200);
      const names = (
        res.body as { data: { list: Array<{ name: string }> } }
      ).data.list.map((r) => r.name);
      expect(names).toContain('searchable-admin');
      expect(names).not.toContain('other-role');
    });

    it('無 VIEW 權限 → 403', async () => {
      const token = await loginNoPerm();
      const res = await get('/api/admin/members/role/options', () => token);
      expectForbidden(res);
    });
  });

  describe('GET /api/admin/members/role/options/:id', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/admin/members/role/options/${roleId}`,
      );
      expectUnauthorized(res);
    });

    it('找到啟用角色 → 200 + { id, name, isAssignable }', async () => {
      const res = await get(`/api/admin/members/role/options/${roleId}`);
      expect(res.status).toBe(200);
      const body = res.body as {
        data: { id: string; name: string; isAssignable: boolean };
      };
      expect(body.data.id).toBe(roleId);
      expect(body.data.name).toBe('admin');
      expect(body.data.isAssignable).toBe(true);
    });

    it('角色不存在 → 404 ROLE_NOT_FOUND', async () => {
      const res = await get(`/api/admin/members/role/options/${MISSING_ID}`);
      expectApiError(res, 404, ResponseCodes.ROLE_NOT_FOUND);
    });

    it('無 VIEW 權限 → 403', async () => {
      const token = await loginNoPerm();
      const res = await get(
        `/api/admin/members/role/options/${roleId}`,
        () => token,
      );
      expectForbidden(res);
    });
  });

  describe('POST /api/admin/members', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/members')
        .send({
          email: 'new@example.com',
          member: 'New',
          password: 'StrongPass123!',
          roleId,
        });
      expectUnauthorized(res);
    });

    it('有 JWT + EDIT，有效資料 → 201 且落庫', async () => {
      const res = await post('/api/admin/members', {
        email: 'new@example.com',
        member: 'New User',
        password: 'StrongPass123!',
        roleId,
      });
      expect(res.status).toBe(201);
      const created = await prisma.memberRecord.findUnique({
        where: { email: 'new@example.com' },
      });
      expect(created?.member).toBe('New User');
    });

    it('email 已存在 → 409', async () => {
      await createTargetMember({ email: 'existing@example.com' });
      const res = await post('/api/admin/members', {
        email: 'existing@example.com',
        member: 'Dup',
        password: 'StrongPass123!',
        roleId,
      });
      expectApiError(res, 409, ResponseCodes.EMAIL_ALREADY_EXISTS);
    });

    it('無效 email → 400', async () => {
      const res = await post('/api/admin/members', {
        email: 'bad-email',
        member: 'X',
        password: 'StrongPass123!',
        roleId,
      });
      expect(res.status).toBe(400);
    });

    it('無 ACCOUNT:EDIT 權限 → 403', async () => {
      const token = await loginNoPerm();
      const res = await post(
        '/api/admin/members',
        {
          email: 'new2@example.com',
          member: 'X',
          password: 'StrongPass123!',
          roleId,
        },
        () => token,
      );
      expectForbidden(res);
    });
  });

  describe('GET /api/admin/members/:id', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/admin/members/${MISSING_ID}`,
      );
      expectUnauthorized(res);
    });

    it('member 存在 → 200', async () => {
      const target = await createTargetMember();
      const res = await get(`/api/admin/members/${target.id}`);
      expect(res.status).toBe(200);
      expect((res.body as { data: { email: string } }).data.email).toBe(
        'target@example.com',
      );
    });

    it('member 不存在 → 404', async () => {
      const res = await get(`/api/admin/members/${MISSING_ID}`);
      expectApiError(res, 404, ResponseCodes.MEMBER_NOT_FOUND);
    });
  });

  describe('PATCH /api/admin/members/:id', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/admin/members/${MISSING_ID}`)
        .send({ status: true });
      expectUnauthorized(res);
    });

    it('有 JWT + EDIT，有效資料 → 204 且落庫', async () => {
      const target = await createTargetMember();
      const res = await patch(`/api/admin/members/${target.id}`, {
        email: 'target@example.com',
        member: 'Updated Name',
        roleId,
        status: true,
      });
      expect(res.status).toBe(204);
      const updated = await prisma.memberRecord.findUnique({
        where: { id: target.id },
      });
      expect(updated?.member).toBe('Updated Name');
    });

    it('member 不存在 → 404', async () => {
      const res = await patch(`/api/admin/members/${MISSING_ID}`, {
        email: 'x@example.com',
        member: 'X',
        roleId,
        status: true,
      });
      expectApiError(res, 404, ResponseCodes.MEMBER_NOT_FOUND);
    });

    it('預設帳號不可編輯 → 409 DEFAULT_MEMBER_NOT_EDITABLE', async () => {
      const target = await createTargetMember({ isDefault: true });
      const res = await patch(`/api/admin/members/${target.id}`, {
        email: 'target@example.com',
        member: 'Updated',
        roleId,
        status: true,
      });
      expectApiError(res, 409, ResponseCodes.DEFAULT_MEMBER_NOT_EDITABLE);
    });

    it('成功後清除 MemberContext 快取', async () => {
      const target = await createTargetMember();
      mockRedis.del.mockClear();
      const res = await patch(`/api/admin/members/${target.id}`, {
        email: 'target@example.com',
        member: 'Role Changed',
        roleId,
        status: true,
      });
      expect(res.status).toBe(204);
      const delKeys = mockRedis.del.mock.calls.flat() as string[];
      expect(delKeys.some((key) => key.includes(target.id))).toBe(true);
    });

    it('將自己停用 → 409 CANNOT_DISABLE_SELF', async () => {
      const res = await patch(`/api/admin/members/${adminId}`, {
        email: AUTH_EMAIL,
        member: 'Auth',
        roleId,
        status: false,
      });
      expectApiError(res, 409, ResponseCodes.CANNOT_DISABLE_SELF);
    });

    it('partial body 只送 { status } → 204 且落庫', async () => {
      const target = await createTargetMember();
      const res = await patch(`/api/admin/members/${target.id}`, {
        status: false,
      });
      expect(res.status).toBe(204);
      const updated = await prisma.memberRecord.findUnique({
        where: { id: target.id },
      });
      expect(updated?.status).toBe(false);
    });

    it('partial body 只送 { member } → 204', async () => {
      const target = await createTargetMember();
      const res = await patch(`/api/admin/members/${target.id}`, {
        member: 'Only Name Changed',
      });
      expect(res.status).toBe(204);
    });
  });

  describe('停用帳號的 JWT 被拒', () => {
    it('登入後帳號在 DB 被停用 → 403 ACCOUNT_DISABLED', async () => {
      await prisma.memberRecord.update({
        where: { id: adminId },
        data: { status: false },
      });
      const res = await get('/api/admin/members');
      expectApiError(res, 403, ResponseCodes.ACCOUNT_DISABLED);
    });
  });

  describe('DELETE /api/admin/members/:id', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/api/admin/members/${MISSING_ID}`,
      );
      expectUnauthorized(res);
    });

    it('有 JWT + EDIT → 204 且軟刪', async () => {
      const target = await createTargetMember();
      const res = await del(`/api/admin/members/${target.id}`);
      expect(res.status).toBe(204);
      const deleted = await prisma.memberRecord.findUnique({
        where: { id: target.id },
      });
      expect(deleted?.deletedAt).not.toBeNull();
    });

    it('刪除自己 → 409 CANNOT_DELETE_SELF', async () => {
      const res = await del(`/api/admin/members/${adminId}`);
      expectApiError(res, 409, ResponseCodes.CANNOT_DELETE_SELF);
    });

    it('預設帳號不可刪除 → 409 DEFAULT_MEMBER_NOT_DELETABLE', async () => {
      const target = await createTargetMember({ isDefault: true });
      const res = await del(`/api/admin/members/${target.id}`);
      expectApiError(res, 409, ResponseCodes.DEFAULT_MEMBER_NOT_DELETABLE);
    });
  });
});
