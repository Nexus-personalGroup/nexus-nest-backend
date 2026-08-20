import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';
import { expectApiError, expectUnauthorized } from '../helpers/assertions';
import { ResponseCodes } from '@app/shared/constants/response-codes';

// 走真 test DB:login 相關 case seed 真會員;黑名單 / throttle 仍走 Redis mock。
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'TestPass123!';

const login = (
  app: NestExpressApplication,
  email = TEST_EMAIL,
  password = TEST_PASSWORD,
) =>
  request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ email, password });

describe('Auth E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

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
    // clearAllMocks 只清呼叫紀錄不清實作，各 mock 的預設回傳都要在此重設，
    // 否則單一測試設的 mockResolvedValue 會洩漏到後續測試
    mockRedis.getBlacklistReason.mockResolvedValue(null);
    mockRedis.throttleIncrement.mockResolvedValue(1);
    await resetDb(prisma);
  });

  describe('POST /api/admin/auth/login', () => {
    it('正確憑證 → 200 + 雙 token + roleName', async () => {
      await seedMember(prisma, {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        roleName: 'member',
      });

      const res = await login(app);

      expect(res.status).toBe(200);
      const body = res.body as {
        data: {
          accessToken: string;
          refreshToken: string;
          accessTokenExpiresIn: number;
          refreshTokenExpiresIn: number;
          member: { roleName: string };
        };
      };
      expect(typeof body.data.accessToken).toBe('string');
      expect(typeof body.data.refreshToken).toBe('string');
      expect(body.data.accessTokenExpiresIn).toBeGreaterThan(0);
      expect(body.data.refreshTokenExpiresIn).toBeGreaterThan(0);
      expect(body.data.member.roleName).toBe('member');
    });

    it('登入成功 → 寫入 lastLoginAt（真 DB）', async () => {
      const { memberId } = await seedMember(prisma, {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });

      await login(app);
      // 等 fire-and-forget 的 lastLoginAt 更新落庫
      await new Promise((r) => setTimeout(r, 300));

      const member = await prisma.memberRecord.findUnique({
        where: { id: memberId },
      });
      expect(member?.lastLoginAt).not.toBeNull();
    });

    it('無效 email 格式 → 400 Zod 驗證錯誤', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/login')
        .send({ email: 'not-an-email', password: 'any' });
      expect(res.status).toBe(400);
    });

    it('使用者不存在 → 401', async () => {
      const res = await login(app, 'nobody@example.com', 'any');
      expectUnauthorized(res);
    });

    it('密碼錯誤 → 401', async () => {
      await seedMember(prisma, { email: TEST_EMAIL, password: TEST_PASSWORD });
      const res = await login(app, TEST_EMAIL, 'wrong-password');
      expectUnauthorized(res);
    });

    it('帳號停用 → 403 ACCOUNT_DISABLED', async () => {
      await seedMember(prisma, {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        status: false,
      });
      const res = await login(app);
      expectApiError(res, 403, ResponseCodes.ACCOUNT_DISABLED);
    });
  });

  describe('GET /api/admin/members', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/admin/members?email=test@example.com',
      );
      expectUnauthorized(res);
    });
  });

  describe('POST /api/admin/auth/logout', () => {
    it('無 JWT → 401', async () => {
      const res = await request(app.getHttpServer()).post(
        '/api/admin/auth/logout',
      );
      expectUnauthorized(res);
    });

    it('完整流程：login → logout → 204 + token 進黑名單', async () => {
      await seedMember(prisma, { email: TEST_EMAIL, password: TEST_PASSWORD });
      const loginRes = await login(app);
      expect(loginRes.status).toBe(200);
      const { accessToken, refreshToken } = (
        loginRes.body as { data: { accessToken: string; refreshToken: string } }
      ).data;

      const logoutRes = await request(app.getHttpServer())
        .post('/api/admin/auth/logout')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      expect(logoutRes.status).toBe(204);
      expect(mockRedis.addToBlacklist).toHaveBeenCalledWith(
        accessToken,
        expect.any(Number),
        'logout',
      );
      expect(mockRedis.addToBlacklist).toHaveBeenCalledWith(
        refreshToken,
        expect.any(Number),
        'logout',
      );
    });
  });

  describe('POST /api/admin/auth/refresh', () => {
    it('有效 refresh token → 200 + 新 access token', async () => {
      await seedMember(prisma, { email: TEST_EMAIL, password: TEST_PASSWORD });
      const loginRes = await login(app);
      const { refreshToken } = (
        loginRes.body as { data: { refreshToken: string } }
      ).data;

      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      const body = res.body as {
        data: { accessToken: string; accessTokenExpiresIn: number };
      };
      expect(typeof body.data.accessToken).toBe('string');
      expect(body.data.accessTokenExpiresIn).toBeGreaterThan(0);
    });

    it('缺少 refreshToken → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/refresh')
        .send({});
      expect(res.status).toBe(400);
    });

    it('無效 refresh token → 401 INVALID_REFRESH_TOKEN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'not-a-valid-jwt' });
      expectApiError(res, 401, ResponseCodes.INVALID_REFRESH_TOKEN);
    });

    it('以 access token 呼叫 → 401 INVALID_REFRESH_TOKEN', async () => {
      await seedMember(prisma, { email: TEST_EMAIL, password: TEST_PASSWORD });
      const loginRes = await login(app);
      const { accessToken } = (
        loginRes.body as { data: { accessToken: string } }
      ).data;

      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: accessToken });
      expectApiError(res, 401, ResponseCodes.INVALID_REFRESH_TOKEN);
    });

    it('輪替後的 refresh 被重用 → 401 INVALID_REFRESH_TOKEN', async () => {
      await seedMember(prisma, { email: TEST_EMAIL, password: TEST_PASSWORD });
      const loginRes = await login(app);
      const { refreshToken } = (
        loginRes.body as { data: { refreshToken: string } }
      ).data;

      mockRedis.getBlacklistReason.mockResolvedValue('rotated');

      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/refresh')
        .send({ refreshToken });
      expectApiError(res, 401, ResponseCodes.INVALID_REFRESH_TOKEN);
    });

    it('帳號停用 → 403 ACCOUNT_DISABLED', async () => {
      const { memberId } = await seedMember(prisma, {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });
      const loginRes = await login(app);
      const { refreshToken } = (
        loginRes.body as { data: { refreshToken: string } }
      ).data;

      // 登入後把帳號停用（真 DB）→ refresh 重查應被擋
      await prisma.memberRecord.update({
        where: { id: memberId },
        data: { status: false },
      });

      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/refresh')
        .send({ refreshToken });
      expectApiError(res, 403, ResponseCodes.ACCOUNT_DISABLED);
    });
  });

  describe('Rate Limiting', () => {
    it('超過速率限制 → 429', async () => {
      mockRedis.throttleIncrement.mockResolvedValue(1_000_000);

      const res = await login(app, TEST_EMAIL, 'any');
      expect(res.status).toBe(429);
    });
  });
});
