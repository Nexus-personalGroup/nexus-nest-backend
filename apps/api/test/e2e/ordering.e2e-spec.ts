import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import {
  resetDb,
  seedMember,
  seedRole,
  ensurePermissions,
} from '../helpers/db';

/**
 * 列表排序守則（涵蓋全部 6 處 `orderBy`）。
 *
 * **設計原則：fixture 的插入順序必須與期望排序相反。**
 * 少了 `ORDER BY` 時資料庫回傳順序是未定義的（實務上常是插入順序或索引順序），
 * 若 fixture 的插入順序剛好等於期望順序，測試就分辨不出「真的照 orderBy 排」還是
 * 「碰巧照插入順序回傳」——刪掉 `orderBy` 也會是綠的。
 *
 * **筆數決定反向驗證的可靠度**：主鍵是 uuid，少了 `ORDER BY` 時回傳順序近乎隨機，
 * n 筆資料有 1/n! 的機率碰巧命中期望順序——3 筆是 1/6（實測真的碰到過一次假綠），
 * 4 筆降到 1/24。故每組至少 4 筆。
 *
 * 驗證方式：拿掉受測的 `orderBy` 後，本檔對應的測試必須變紅。
 */
describe('列表排序 E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let token: string;
  const mockRedis = createMockRedis();

  const ADMIN_EMAIL = 'ordering-admin@example.com';
  const PASSWORD = 'TestPass123!';
  // 明確拉開時間差，避免連續 insert 落在同一毫秒導致排序不穩定
  const T1 = new Date('2026-01-01T00:00:00.000Z');
  const T2 = new Date('2026-02-01T00:00:00.000Z');
  const T3 = new Date('2026-03-01T00:00:00.000Z');
  const T4 = new Date('2026-04-01T00:00:00.000Z');

  const get = (url: string) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token}`);

  const login = async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    return (res.body as { data: { accessToken: string } }).data.accessToken;
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
  });

  describe('GET /api/admin/members（createdAt desc）', () => {
    it('較新的帳號排在前面', async () => {
      // 插入順序 舊→新，期望回傳 新→舊：若無 orderBy 會拿到插入順序而變紅
      await seedMember(prisma, {
        email: ADMIN_EMAIL,
        password: PASSWORD,
        roleCode: 'SUPERADMIN',
        permissionCodes: ['BACKEND:ACCOUNT:VIEW'],
        createdAt: T1,
      });
      // roles.name 有 unique 限制，每個 seedMember 都會建 role，故須各自命名
      await seedMember(prisma, {
        email: 'ordering-mid@example.com',
        password: PASSWORD,
        roleName: 'ordering-role-mid',
        createdAt: T2,
      });
      await seedMember(prisma, {
        email: 'ordering-new@example.com',
        password: PASSWORD,
        roleName: 'ordering-role-new',
        createdAt: T3,
      });
      await seedMember(prisma, {
        email: 'ordering-newest@example.com',
        password: PASSWORD,
        roleName: 'ordering-role-newest',
        createdAt: T4,
      });
      token = await login();

      const res = await get('/api/admin/members');
      const emails = (
        res.body as { data: { list: Array<{ email: string }> } }
      ).data.list.map((m) => m.email);

      expect(emails).toEqual([
        'ordering-newest@example.com',
        'ordering-new@example.com',
        'ordering-mid@example.com',
        ADMIN_EMAIL,
      ]);
    });
  });

  describe('GET /api/admin/roles（createdAt desc）', () => {
    it('較新的角色排在前面', async () => {
      await seedMember(prisma, {
        email: ADMIN_EMAIL,
        password: PASSWORD,
        roleName: 'zzz-admin-role',
        roleCode: 'SUPERADMIN',
        permissionCodes: ['BACKEND:ROLE:VIEW'],
        createdAt: T1,
      });
      // 角色的插入順序 舊→新，期望 新→舊
      await seedRole(prisma, { name: 'role-old', createdAt: T1 });
      await seedRole(prisma, { name: 'role-mid', createdAt: T2 });
      await seedRole(prisma, { name: 'role-new', createdAt: T3 });
      await seedRole(prisma, { name: 'role-newest', createdAt: T4 });
      token = await login();

      const res = await get('/api/admin/roles');
      const names = (
        res.body as { data: { list: Array<{ name: string }> } }
      ).data.list.map((r) => r.name);

      // admin 自身的角色也在列表中，只比對三個受測角色的相對順序
      expect(names.filter((n) => n.startsWith('role-'))).toEqual([
        'role-newest',
        'role-new',
        'role-mid',
        'role-old',
      ]);
    });
  });

  describe('GET /api/admin/members/role/options（createdAt asc）', () => {
    it('較舊的角色排在前面（與列表相反）', async () => {
      await seedMember(prisma, {
        email: ADMIN_EMAIL,
        password: PASSWORD,
        roleName: 'zzz-admin-role',
        roleCode: 'SUPERADMIN',
        permissionCodes: ['BACKEND:ACCOUNT:VIEW'],
        createdAt: T3,
      });
      // 這支是 asc，所以插入順序刻意「新→舊」，期望回傳「舊→新」
      await seedRole(prisma, { name: 'opt-new', createdAt: T3 });
      await seedRole(prisma, { name: 'opt-mid', createdAt: T2 });
      await seedRole(prisma, { name: 'opt-old', createdAt: T1 });
      await seedRole(prisma, {
        name: 'opt-oldest',
        createdAt: new Date('2025-12-01T00:00:00.000Z'),
      });
      token = await login();

      const res = await get('/api/admin/members/role/options');
      const names = (
        res.body as { data: { list: Array<{ name: string }> } }
      ).data.list.map((r) => r.name);

      expect(names.filter((n) => n.startsWith('opt-'))).toEqual([
        'opt-oldest',
        'opt-old',
        'opt-mid',
        'opt-new',
      ]);
    });
  });

  describe('GET /api/admin/roles/permissions（module asc, action asc）', () => {
    it('依 module 再依 action 排序，與插入順序無關', async () => {
      await seedMember(prisma, {
        email: ADMIN_EMAIL,
        password: PASSWORD,
        roleCode: 'SUPERADMIN',
        permissionCodes: ['BACKEND:ROLE:VIEW'],
        createdAt: T1,
      });
      // 插入順序刻意與期望排序完全相反（module 由大到小、action 由大到小）
      await ensurePermissions(prisma, [
        'BACKEND:ZEBRA:VIEW',
        'BACKEND:ZEBRA:EDIT',
        'BACKEND:ALPHA:VIEW',
        'BACKEND:ALPHA:EDIT',
      ]);
      token = await login();

      const res = await get('/api/admin/roles/permissions');
      const codes = (
        res.body as { data: Array<{ permissionCode: string }> }
      ).data.map((p) => p.permissionCode);
      const target = codes.filter(
        (c) => c.includes('ALPHA') || c.includes('ZEBRA'),
      );

      expect(target).toEqual([
        'BACKEND:ALPHA:EDIT',
        'BACKEND:ALPHA:VIEW',
        'BACKEND:ZEBRA:EDIT',
        'BACKEND:ZEBRA:VIEW',
      ]);
    });
  });

  describe('GET /api/admin/security/ip-*（createdAt desc）', () => {
    beforeEach(async () => {
      await seedMember(prisma, {
        email: ADMIN_EMAIL,
        password: PASSWORD,
        roleCode: 'SUPERADMIN',
        permissionCodes: ['BACKEND:ACCOUNT:VIEW'],
        createdAt: T1,
      });
      token = await login();
    });

    it('白名單：較新的排在前面', async () => {
      // 插入 舊→新，期望 新→舊
      await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '10.0.0.1', description: 'old', createdAt: T1 },
      });
      await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '10.0.0.2', description: 'mid', createdAt: T2 },
      });
      await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '10.0.0.3', description: 'new', createdAt: T3 },
      });
      await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '10.0.0.4', description: 'newest', createdAt: T4 },
      });

      const res = await get('/api/admin/security/ip-whitelist');
      const ips = (
        res.body as { data: { list: Array<{ ipAddress: string }> } }
      ).data.list.map((r) => r.ipAddress);

      expect(ips).toEqual(['10.0.0.4', '10.0.0.3', '10.0.0.2', '10.0.0.1']);
    });

    it('黑名單：較新的排在前面', async () => {
      // 黑名單的欄位是 reason（白名單才是 description）
      await prisma.ipBlacklistRecord.create({
        data: { ipAddress: '10.1.0.1', reason: 'old', createdAt: T1 },
      });
      await prisma.ipBlacklistRecord.create({
        data: { ipAddress: '10.1.0.2', reason: 'mid', createdAt: T2 },
      });
      await prisma.ipBlacklistRecord.create({
        data: { ipAddress: '10.1.0.3', reason: 'new', createdAt: T3 },
      });
      await prisma.ipBlacklistRecord.create({
        data: { ipAddress: '10.1.0.4', reason: 'newest', createdAt: T4 },
      });

      const res = await get('/api/admin/security/ip-blacklist');
      const ips = (
        res.body as { data: { list: Array<{ ipAddress: string }> } }
      ).data.list.map((r) => r.ipAddress);

      expect(ips).toEqual(['10.1.0.4', '10.1.0.3', '10.1.0.2', '10.1.0.1']);
    });
  });
});
