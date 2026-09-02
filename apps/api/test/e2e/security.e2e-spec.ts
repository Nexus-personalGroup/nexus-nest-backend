import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';
import {
  expectApiError,
  expectUnauthorized,
  describeUnauthorized,
} from '../helpers/assertions';
import { ResponseCodes } from '@app/shared/constants/response-codes';

// 走真 test DB:beforeEach seed 一個 roleCode=SUPERADMIN 的 admin 並登入取 token
//（security 走 RolesGuard + @Roles(SUPERADMIN)，flag 預設開啟,roleCode 由 JwtAuthGuard 每次查 DB 補上）。
// IP 名單直接落庫 / 查庫斷言;unlock 以真鎖定紀錄驗證;forgot/reset-password 為 @Public 免 token。
const ADMIN_EMAIL = 'admin@test.com';
const PASSWORD = 'TestPass123!';
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

describe('Security E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let token: string;
  let adminRoleId: string;
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
    ({ roleId: adminRoleId } = await seedMember(prisma, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      roleName: '管理者',
      roleCode: 'SUPERADMIN',
    }));
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    token = (res.body as { data: { accessToken: string } }).data.accessToken;
  });

  // ── IP 白名單 ──────────────────────────────

  // 未授權存取:guard 在查資料前就擋下,故 :id 用固定 uuid 即可
  describe('未授權存取', () => {
    describeUnauthorized(() => app, 'post', '/api/admin/security/ip-whitelist');
    describeUnauthorized(
      () => app,
      'get',
      `/api/admin/security/ip-whitelist/${MISSING_ID}`,
    );
    describeUnauthorized(
      () => app,
      'patch',
      `/api/admin/security/ip-whitelist/${MISSING_ID}`,
    );
    describeUnauthorized(
      () => app,
      'delete',
      `/api/admin/security/ip-whitelist/${MISSING_ID}`,
    );
    describeUnauthorized(() => app, 'get', '/api/admin/security/ip-blacklist');
    describeUnauthorized(() => app, 'post', '/api/admin/security/ip-blacklist');
    describeUnauthorized(
      () => app,
      'get',
      `/api/admin/security/ip-blacklist/${MISSING_ID}`,
    );
    describeUnauthorized(
      () => app,
      'patch',
      `/api/admin/security/ip-blacklist/${MISSING_ID}`,
    );
    describeUnauthorized(
      () => app,
      'delete',
      `/api/admin/security/ip-blacklist/${MISSING_ID}`,
    );
    describeUnauthorized(
      () => app,
      'post',
      '/api/admin/security/unlock-account',
    );
    describeUnauthorized(() => app, 'get', '/api/admin/security/locks');
  });

  describe('GET /api/admin/security/ip-whitelist', () => {
    it('Admin JWT → 200 + { list, meta }', async () => {
      await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '1.2.3.4', description: 'test' },
      });

      const res = await get('/api/admin/security/ip-whitelist');

      expect(res.status).toBe(200);
      const body = res.body as {
        data: {
          list: Array<{ id: string; ipAddress: string }>;
          meta: { page: number; total: number };
        };
      };
      expect(body.data.list).toHaveLength(1);
      expect(body.data.list[0].ipAddress).toBe('1.2.3.4');
      expect(body.data.meta.page).toBe(1);
      expect(body.data.meta.total).toBe(1);
    });

    it('search → 依 ipAddress 模糊過濾', async () => {
      await prisma.ipWhitelistRecord.createMany({
        data: [{ ipAddress: '192.168.1.1' }, { ipAddress: '10.0.0.1' }],
      });

      const res = await get('/api/admin/security/ip-whitelist?search=192.168');

      expect(res.status).toBe(200);
      const body = res.body as {
        data: { list: Array<{ ipAddress: string }> };
      };
      expect(body.data.list).toHaveLength(1);
      expect(body.data.list[0].ipAddress).toBe('192.168.1.1');
    });

    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/admin/security/ip-whitelist',
      );

      expectUnauthorized(res);
    });
  });

  describe('POST /api/admin/security/ip-whitelist', () => {
    it('Admin 新增白名單 → 201 + { id } 且落庫', async () => {
      const res = await post('/api/admin/security/ip-whitelist', {
        ip: '10.0.0.1',
        description: '辦公室',
      });

      expect(res.status).toBe(201);
      const id = (res.body as { data: { id: string } }).data.id;
      expect(typeof id).toBe('string');
      const row = await prisma.ipWhitelistRecord.findUnique({
        where: { ipAddress: '10.0.0.1' },
      });
      expect(row?.description).toBe('辦公室');
    });

    it('缺少 ip → 400', async () => {
      const res = await post('/api/admin/security/ip-whitelist', {});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/security/ip-whitelist/:id', () => {
    it('Admin 取單筆 → 200', async () => {
      const { id } = await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '10.0.0.1', description: 'office' },
      });

      const res = await get(`/api/admin/security/ip-whitelist/${id}`);

      expect(res.status).toBe(200);
      const body = res.body as { data: { id: string; ipAddress: string } };
      expect(body.data.id).toBe(id);
      expect(body.data.ipAddress).toBe('10.0.0.1');
    });

    it('找不到紀錄 → 404 IP_LIST_NOT_FOUND', async () => {
      const res = await get(`/api/admin/security/ip-whitelist/${MISSING_ID}`);

      expectApiError(res, 404, ResponseCodes.IP_LIST_NOT_FOUND);
    });
  });

  describe('PATCH /api/admin/security/ip-whitelist/:id', () => {
    it('Admin 更新成功 → 204 且落庫', async () => {
      const { id } = await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '10.0.0.1', description: '舊備註' },
      });

      const res = await patch(`/api/admin/security/ip-whitelist/${id}`, {
        description: '新備註',
      });

      expect(res.status).toBe(204);
      const row = await prisma.ipWhitelistRecord.findUnique({ where: { id } });
      expect(row?.description).toBe('新備註');
    });

    it('紀錄不存在 → 404 IP_LIST_NOT_FOUND', async () => {
      const res = await patch(
        `/api/admin/security/ip-whitelist/${MISSING_ID}`,
        {
          description: 'x',
        },
      );

      expectApiError(res, 404, ResponseCodes.IP_LIST_NOT_FOUND);
    });
  });

  describe('DELETE /api/admin/security/ip-whitelist/:id', () => {
    it('Admin 移除 → 204 且落庫刪除', async () => {
      const { id } = await prisma.ipWhitelistRecord.create({
        data: { ipAddress: '10.0.0.1' },
      });

      const res = await del(`/api/admin/security/ip-whitelist/${id}`);

      expect(res.status).toBe(204);
      const row = await prisma.ipWhitelistRecord.findUnique({ where: { id } });
      expect(row).toBeNull();
    });

    it('紀錄不存在仍 → 204（靜默通過，硬刪）', async () => {
      const res = await del(`/api/admin/security/ip-whitelist/${MISSING_ID}`);

      expect(res.status).toBe(204);
    });

    it('非 uuid path param → 400', async () => {
      const res = await del('/api/admin/security/ip-whitelist/not-a-uuid');

      expect(res.status).toBe(400);
    });
  });

  // ── IP 黑名單 ──────────────────────────────

  describe('GET /api/admin/security/ip-blacklist', () => {
    it('Admin JWT → 200', async () => {
      const res = await get('/api/admin/security/ip-blacklist');

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/admin/security/ip-blacklist', () => {
    it('Admin 新增黑名單 → 201 + { id }，isAutoBlock 預設 false', async () => {
      const res = await post('/api/admin/security/ip-blacklist', {
        ip: '192.168.1.100',
        reason: '惡意攻擊',
      });

      expect(res.status).toBe(201);
      const id = (res.body as { data: { id: string } }).data.id;
      expect(typeof id).toBe('string');
      const row = await prisma.ipBlacklistRecord.findUnique({
        where: { ipAddress: '192.168.1.100' },
      });
      expect(row?.reason).toBe('惡意攻擊');
      expect(row?.isAutoBlock).toBe(false);
    });
  });

  describe('GET /api/admin/security/ip-blacklist/:id', () => {
    it('Admin 取單筆 → 200', async () => {
      const { id } = await prisma.ipBlacklistRecord.create({
        data: { ipAddress: '1.2.3.4', reason: 'brute force' },
      });

      const res = await get(`/api/admin/security/ip-blacklist/${id}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        data: { id: string; ipAddress: string; isAutoBlock: boolean };
      };
      expect(body.data.id).toBe(id);
      expect(body.data.isAutoBlock).toBe(false);
    });

    it('找不到紀錄 → 404 IP_LIST_NOT_FOUND', async () => {
      const res = await get(`/api/admin/security/ip-blacklist/${MISSING_ID}`);

      expectApiError(res, 404, ResponseCodes.IP_LIST_NOT_FOUND);
    });
  });

  describe('PATCH /api/admin/security/ip-blacklist/:id', () => {
    it('Admin 更新成功 → 204 且落庫', async () => {
      const { id } = await prisma.ipBlacklistRecord.create({
        data: { ipAddress: '1.2.3.4', reason: '舊理由' },
      });

      const res = await patch(`/api/admin/security/ip-blacklist/${id}`, {
        reason: '新理由',
      });

      expect(res.status).toBe(204);
      const row = await prisma.ipBlacklistRecord.findUnique({ where: { id } });
      expect(row?.reason).toBe('新理由');
    });

    it('紀錄不存在 → 404 IP_LIST_NOT_FOUND', async () => {
      const res = await patch(
        `/api/admin/security/ip-blacklist/${MISSING_ID}`,
        {
          reason: 'x',
        },
      );

      expectApiError(res, 404, ResponseCodes.IP_LIST_NOT_FOUND);
    });
  });

  describe('DELETE /api/admin/security/ip-blacklist/:id', () => {
    it('Admin 移除 → 204 且落庫刪除', async () => {
      const { id } = await prisma.ipBlacklistRecord.create({
        data: { ipAddress: '1.2.3.4' },
      });

      const res = await del(`/api/admin/security/ip-blacklist/${id}`);

      expect(res.status).toBe(204);
      const row = await prisma.ipBlacklistRecord.findUnique({ where: { id } });
      expect(row).toBeNull();
    });

    it('紀錄不存在仍 → 204', async () => {
      const res = await del(`/api/admin/security/ip-blacklist/${MISSING_ID}`);

      expect(res.status).toBe(204);
    });
  });

  // ── 帳號解鎖 ───────────────────────────────

  describe('GET /api/admin/security/locks', () => {
    /** 建一個帶 lockedAt 的帳號；分鐘為負代表鎖在過去 */
    const seedLocked = (email: string, minutesAgo: number) =>
      prisma.memberRecord.create({
        data: {
          member: email,
          email,
          password: 'x',
          roleId: adminRoleId,
          status: true,
          isDefault: false,
          lockedAt: new Date(Date.now() - minutesAgo * 60_000),
          failedLoginCount: 3,
        },
      });

    it('預設只回鎖定中的帳號', async () => {
      await seedLocked('fresh@test.com', 1);
      // 預設時效 30 分鐘，兩小時前的已到期
      await seedLocked('stale@test.com', 120);

      const res = await get('/api/admin/security/locks');

      expect(res.status).toBe(200);
      const emails = res.body.data.list.map((r: { email: string }) => r.email);
      expect(emails).toEqual(['fresh@test.com']);
      expect(res.body.data.list[0].status).toBe('locked');
      expect(res.body.data.list[0].unlocksAt).toBeDefined();
    });

    it('status=expired 只回已到期的', async () => {
      await seedLocked('fresh@test.com', 1);
      await seedLocked('stale@test.com', 120);

      const res = await get('/api/admin/security/locks?status=expired');

      expect(res.status).toBe(200);
      expect(res.body.data.list.map((r: { email: string }) => r.email)).toEqual(
        ['stale@test.com'],
      );
      expect(res.body.data.list[0].status).toBe('expired');
    });

    it('status=all 兩者都回', async () => {
      await seedLocked('fresh@test.com', 1);
      await seedLocked('stale@test.com', 120);

      const res = await get('/api/admin/security/locks?status=all');

      expect(res.status).toBe(200);
      expect(res.body.data.meta.total).toBe(2);
    });

    it('email 模糊搜尋', async () => {
      await seedLocked('alice@test.com', 1);
      await seedLocked('bob@test.com', 1);

      const res = await get('/api/admin/security/locks?search=ALI');

      expect(res.status).toBe(200);
      expect(res.body.data.list.map((r: { email: string }) => r.email)).toEqual(
        ['alice@test.com'],
      );
    });

    it('沒有任何鎖定紀錄 → 200 空清單', async () => {
      const res = await get('/api/admin/security/locks');

      expect(res.status).toBe(200);
      expect(res.body.data.list).toEqual([]);
      expect(res.body.data.meta.total).toBe(0);
    });

    // 帳號鎖定預設關閉，e2e 環境沒有開——正好驗到 flag 為 false 的情形。
    // 沒有這個旗標，畫面分不出「沒有人被鎖」與「根本不會鎖」
    it('⭐ 回應帶 lockEnabled，反映功能是否啟用', async () => {
      const res = await get('/api/admin/security/locks');

      expect(res.status).toBe(200);
      expect(typeof res.body.data.lockEnabled).toBe('boolean');
    });

    it('非法 status → 400', async () => {
      const res = await get('/api/admin/security/locks?status=whatever');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/admin/security/unlock-account', () => {
    it('Admin 解鎖鎖定帳號 → 204 且落庫清鎖', async () => {
      await prisma.memberRecord.create({
        data: {
          member: 'Locked',
          email: 'locked@test.com',
          password: 'x',
          roleId: adminRoleId,
          status: true,
          isDefault: false,
          lockedAt: new Date(),
          failedLoginCount: 5,
        },
      });

      const res = await post('/api/admin/security/unlock-account', {
        email: 'locked@test.com',
      });

      expect(res.status).toBe(204);
      const row = await prisma.memberRecord.findUnique({
        where: { email: 'locked@test.com' },
      });
      expect(row?.lockedAt).toBeNull();
      expect(row?.failedLoginCount).toBe(0);
    });

    it('email 不存在 → 404 EMAIL_NOT_FOUND', async () => {
      const res = await post('/api/admin/security/unlock-account', {
        email: 'unknown@test.com',
      });

      expectApiError(res, 404, ResponseCodes.EMAIL_NOT_FOUND);
    });

    it('帳號未鎖 → 409 ACCOUNT_NOT_LOCKED', async () => {
      // admin 帳號本身未鎖定
      const res = await post('/api/admin/security/unlock-account', {
        email: ADMIN_EMAIL,
      });

      expectApiError(res, 409, ResponseCodes.ACCOUNT_NOT_LOCKED);
    });

    it('缺少 email → 400', async () => {
      const res = await post('/api/admin/security/unlock-account', {});

      expect(res.status).toBe(400);
    });

    it('無效 email 格式 → 400', async () => {
      const res = await post('/api/admin/security/unlock-account', {
        email: 'not-email',
      });

      expect(res.status).toBe(400);
    });
  });

  // ── Auth: forgot-password / reset-password ─

  describe('POST /api/admin/auth/forgot-password', () => {
    it('已註冊 email → 204 且落庫產生 reset token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/forgot-password')
        .send({ email: ADMIN_EMAIL });

      expect(res.status).toBe(204);
      const count = await prisma.passwordResetTokenRecord.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('不存在 email → 204（同樣回傳成功，防列舉）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/forgot-password')
        .send({ email: 'nobody@test.com' });

      expect(res.status).toBe(204);
    });

    it('缺少 email → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/forgot-password')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/admin/auth/reset-password', () => {
    it('無效 token → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/reset-password')
        .send({ token: 'invalid-token', newPassword: 'NewPass123!' });

      expect(res.status).toBe(400);
    });

    it('缺少參數 → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/reset-password')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
