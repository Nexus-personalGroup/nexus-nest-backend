import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember, seedRole } from '../helpers/db';
import {
  expectApiError,
  expectUnauthorized,
  describeUnauthorized,
} from '../helpers/assertions';
import { ResponseCodes } from '@app/shared/constants/response-codes';

// 走真 test DB:beforeEach seed 一個帶 BACKEND:ROLE:VIEW/EDIT 的 admin 並登入取 token；
// 目標角色以 seedRole 建，斷言查真 DB。列表含 admin 自身的角色，故用「包含」語意。
const ADMIN_EMAIL = 'auth@example.com';
const PASSWORD = 'TestPass123!';
const ROLE_PERMS = ['BACKEND:ROLE:VIEW', 'BACKEND:ROLE:EDIT'];
const MISSING_ID = '00000000-0000-4000-8000-000000000099';

describe('Role E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let token: string;
  const mockRedis = createMockRedis();

  const get = (url: string) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token}`);
  const post = (url: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const patch = (url: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const del = (url: string) =>
    request(app.getHttpServer())
      .delete(url)
      .set('Authorization', `Bearer ${token}`);

  const roleNames = (body: unknown): string[] =>
    (body as { data: { list: Array<{ name: string }> } }).data.list.map(
      (r) => r.name,
    );

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
      email: ADMIN_EMAIL,
      password: PASSWORD,
      roleName: 'admin',
      permissionCodes: ROLE_PERMS,
    });
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    token = (res.body as { data: { accessToken: string } }).data.accessToken;
  });

  // 未授權存取:guard 在查資料前就擋下,故 :id 用固定 uuid 即可
  describe('未授權存取', () => {
    describeUnauthorized(() => app, 'get', '/api/admin/roles/permissions');
    describeUnauthorized(() => app, 'get', `/api/admin/roles/${MISSING_ID}`);
    describeUnauthorized(() => app, 'post', '/api/admin/roles');
    describeUnauthorized(() => app, 'patch', `/api/admin/roles/${MISSING_ID}`);
    describeUnauthorized(() => app, 'delete', `/api/admin/roles/${MISSING_ID}`);
  });

  describe('GET /api/admin/roles', () => {
    it('回傳角色列表 → 200（含目標角色）', async () => {
      await seedRole(prisma, { name: '管理者' });

      const res = await get('/api/admin/roles');

      expect(res.status).toBe(200);
      expect(roleNames(res.body)).toContain('管理者');
      expect(
        (res.body as { data: { meta: { total: number } } }).data.meta.total,
      ).toBeGreaterThanOrEqual(2);
    });

    it('無 token → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/admin/roles');
      expectUnauthorized(res);
    });

    it('status=true → 只回啟用角色', async () => {
      await seedRole(prisma, { name: '啟用角色', status: true });
      await seedRole(prisma, { name: '停用角色', status: false });

      const res = await get('/api/admin/roles?status=true');

      expect(res.status).toBe(200);
      const names = roleNames(res.body);
      expect(names).toContain('啟用角色');
      expect(names).not.toContain('停用角色');
    });

    it('status=false → 只回停用角色', async () => {
      await seedRole(prisma, { name: '啟用角色', status: true });
      await seedRole(prisma, { name: '停用角色', status: false });

      const res = await get('/api/admin/roles?status=false');

      expect(res.status).toBe(200);
      const names = roleNames(res.body);
      expect(names).toContain('停用角色');
      expect(names).not.toContain('啟用角色');
      expect(names).not.toContain('admin');
    });

    it('未帶 status → 啟用停用都回', async () => {
      await seedRole(prisma, { name: '啟用角色', status: true });
      await seedRole(prisma, { name: '停用角色', status: false });

      const res = await get('/api/admin/roles');

      const names = roleNames(res.body);
      expect(names).toContain('啟用角色');
      expect(names).toContain('停用角色');
    });

    it('status=foo（非合法 enum）→ 400', async () => {
      const res = await get('/api/admin/roles?status=foo');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/roles/permissions', () => {
    it('回傳可用 permission 清單 → 200', async () => {
      const res = await get('/api/admin/roles/permissions');

      expect(res.status).toBe(200);
      const codes = (
        res.body as { data: Array<{ permissionCode: string }> }
      ).data.map((p) => p.permissionCode);
      expect(codes).toContain('BACKEND:ROLE:VIEW');
    });
  });

  describe('POST /api/admin/roles', () => {
    it('建立成功 → 201 且落庫', async () => {
      const res = await post('/api/admin/roles', {
        name: '審核角色',
        permissionCodes: [],
      });

      expect(res.status).toBe(201);
      const id = (res.body as { data: { id: string } }).data.id;
      const role = await prisma.role.findUnique({ where: { id } });
      expect(role?.name).toBe('審核角色');
    });

    it('名稱衝突 → 409 DUPLICATE_ROLE_NAME', async () => {
      await seedRole(prisma, { name: '管理者' });

      const res = await post('/api/admin/roles', {
        name: '管理者',
        permissionCodes: [],
      });

      expectApiError(res, 409, ResponseCodes.DUPLICATE_ROLE_NAME);
    });

    it('EDIT 缺少對應 VIEW → 400 INVALID_PERMISSION_COMBINATION', async () => {
      const res = await post('/api/admin/roles', {
        name: '新角色',
        permissionCodes: ['BACKEND:ROLE:EDIT'],
      });

      expectApiError(res, 400, ResponseCodes.INVALID_PERMISSION_COMBINATION);
    });
  });

  describe('GET /api/admin/roles/:id', () => {
    it('回傳角色詳情 → 200', async () => {
      const id = await seedRole(prisma, {
        name: '管理者',
        permissionCodes: ['BACKEND:ROLE:VIEW'],
      });

      const res = await get(`/api/admin/roles/${id}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        data: { id: string; name: string; permissionCodes: string[] };
      };
      expect(body.data.id).toBe(id);
      expect(body.data.name).toBe('管理者');
      expect(body.data.permissionCodes).toContain('BACKEND:ROLE:VIEW');
    });

    it('角色不存在 → 404 ROLE_NOT_FOUND', async () => {
      const res = await get(`/api/admin/roles/${MISSING_ID}`);
      expectApiError(res, 404, ResponseCodes.ROLE_NOT_FOUND);
    });
  });

  describe('PATCH /api/admin/roles/:id', () => {
    it('更新成功 → 204 且落庫', async () => {
      const id = await seedRole(prisma, { name: '原名稱' });

      const res = await patch(`/api/admin/roles/${id}`, {
        name: '新名稱',
        permissionCodes: [],
      });

      expect(res.status).toBe(204);
      const role = await prisma.role.findUnique({ where: { id } });
      expect(role?.name).toBe('新名稱');
    });

    it('預設角色不可編輯 → 400 DEFAULT_ROLE_NOT_EDITABLE', async () => {
      const id = await seedRole(prisma, { name: '預設角色', isDefault: true });

      const res = await patch(`/api/admin/roles/${id}`, {
        name: '新名稱',
        permissionCodes: [],
      });

      expectApiError(res, 400, ResponseCodes.DEFAULT_ROLE_NOT_EDITABLE);
    });

    it('角色不存在 → 404 ROLE_NOT_FOUND', async () => {
      const res = await patch(`/api/admin/roles/${MISSING_ID}`, {
        name: '新名稱',
        permissionCodes: [],
      });

      expectApiError(res, 404, ResponseCodes.ROLE_NOT_FOUND);
    });

    it('僅送 status → 204 且僅 status 落庫', async () => {
      const id = await seedRole(prisma, { name: '角色A', status: true });

      const res = await patch(`/api/admin/roles/${id}`, { status: false });

      expect(res.status).toBe(204);
      const role = await prisma.role.findUnique({ where: { id } });
      expect(role?.status).toBe(false);
      expect(role?.name).toBe('角色A');
    });

    it('name + status 同送 → 204 且皆落庫', async () => {
      const id = await seedRole(prisma, { name: '角色B', status: true });

      const res = await patch(`/api/admin/roles/${id}`, {
        name: '審核人員',
        status: false,
      });

      expect(res.status).toBe(204);
      const role = await prisma.role.findUnique({ where: { id } });
      expect(role?.name).toBe('審核人員');
      expect(role?.status).toBe(false);
    });

    it('status 型別錯誤（非 boolean）→ 400', async () => {
      const id = await seedRole(prisma, { name: '角色C' });

      const res = await patch(`/api/admin/roles/${id}`, { status: 'off' });
      expect(res.status).toBe(400);
    });

    it('預設角色僅切 status → 400 DEFAULT_ROLE_NOT_EDITABLE', async () => {
      const id = await seedRole(prisma, { name: '預設角色', isDefault: true });

      const res = await patch(`/api/admin/roles/${id}`, { status: false });

      expectApiError(res, 400, ResponseCodes.DEFAULT_ROLE_NOT_EDITABLE);
    });
  });

  describe('DELETE /api/admin/roles/:id', () => {
    it('軟刪除成功 → 204', async () => {
      const id = await seedRole(prisma, { name: '待刪角色' });

      const res = await del(`/api/admin/roles/${id}`);

      expect(res.status).toBe(204);
      const role = await prisma.role.findUnique({ where: { id } });
      expect(role?.deletedAt).not.toBeNull();
    });

    it('軟刪除時對 name 加 suffix 釋放 unique 約束', async () => {
      const id = await seedRole(prisma, { name: '管理者' });

      await del(`/api/admin/roles/${id}`);

      const role = await prisma.role.findUnique({ where: { id } });
      // softDelete 用「原 name + ts + 4-byte random hex」格式 mangle，釋放 name @unique
      expect(role?.name).toMatch(/^管理者_\d+_[a-f0-9]{8}$/);
      expect(role?.deletedAt).not.toBeNull();
    });

    it('預設角色不可刪除 → 400 DEFAULT_ROLE_NOT_DELETABLE', async () => {
      const id = await seedRole(prisma, { name: '預設角色', isDefault: true });

      const res = await del(`/api/admin/roles/${id}`);

      expectApiError(res, 400, ResponseCodes.DEFAULT_ROLE_NOT_DELETABLE);
    });

    it('角色仍有成員 → 409 ROLE_HAS_MEMBERS', async () => {
      const roleId = await seedRole(prisma, { name: '有成員角色' });
      await prisma.memberRecord.create({
        data: {
          member: '成員',
          email: 'member-of-role@example.com',
          password: 'x',
          roleId,
          status: true,
          isDefault: false,
        },
      });

      const res = await del(`/api/admin/roles/${roleId}`);

      expectApiError(res, 409, ResponseCodes.ROLE_HAS_MEMBERS);
    });
  });
});
