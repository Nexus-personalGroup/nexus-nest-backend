import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { ResponseCodes } from '@app/shared/constants/response-codes';
import { PermissionCode } from '@app/domain/value-object/Role';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember, seedUser } from '../helpers/db';
import { expectApiError } from '../helpers/assertions';

const PASSWORD = 'User1234!';
const ADMIN_PASSWORD = 'TestPass123!';

type TokenBody = {
  data: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; displayName: string };
  };
};

/**
 * 前台認證（e2e）。
 *
 * 重點不在「登入會成功」，而在**兩側的隔離**：前台簽的 token 過不了後台，
 * 後台簽的過不了前台——而且不是因為權限不足，是簽章根本驗不過。
 */
describe('Front Auth E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

  let userId = '';
  let adminToken = '';

  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/front/auth/login')
      .send({ email, password });

  const me = (token: string) =>
    request(app.getHttpServer())
      .get('/api/front/me')
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

    const user = await seedUser(prisma, {
      email: 'user1@test.com',
      password: PASSWORD,
      displayName: '小明',
    });
    userId = user.userId;
    await seedUser(prisma, {
      email: 'suspended@test.com',
      password: PASSWORD,
      status: false,
    });

    await seedMember(prisma, {
      email: 'admin@test.com',
      password: ADMIN_PASSWORD,
      permissionCodes: [PermissionCode.BACKEND_ACCOUNT_VIEW],
    });
    const adminRes = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: 'admin@test.com', password: ADMIN_PASSWORD });
    adminToken = (adminRes.body as TokenBody).data.accessToken;
  });

  describe('登入', () => {
    it('登入成功回傳 token 與使用者摘要', async () => {
      const res = await login('user1@test.com', PASSWORD);

      expect(res.status).toBe(200);
      const { data } = res.body as TokenBody;
      expect(data.user).toEqual({
        id: userId,
        email: 'user1@test.com',
        displayName: '小明',
        avatarUrl: null,
      });
    });

    it('登入更新 lastSeenAt', async () => {
      await login('user1@test.com', PASSWORD);

      const user = await prisma.userRecord.findUnique({
        where: { id: userId },
      });
      expect(user?.lastSeenAt).not.toBeNull();
    });

    it('密碼錯誤與帳號不存在的回應一致', async () => {
      const wrong = await login('user1@test.com', 'wrong-password');
      const ghost = await login('ghost@test.com', PASSWORD);

      expect(wrong.status).toBe(ghost.status);
      expect((wrong.body as { message: string }).message).toBe(
        (ghost.body as { message: string }).message,
      );
    });

    it('停權的帳號 → 403', async () => {
      const res = await login('suspended@test.com', PASSWORD);

      expectApiError(res, 403, ResponseCodes.ACCOUNT_DISABLED);
    });

    // 後台那套 failedLoginCount + lockedAt 是未認證者可觸發的 DoS 面
    it('⭐ 連續失敗不會鎖定帳號', async () => {
      for (let i = 0; i < 5; i += 1) {
        await login('user1@test.com', 'wrong-password');
      }

      const res = await login('user1@test.com', PASSWORD);

      expect(res.status).toBe(200);
    });
  });

  describe('側別隔離', () => {
    /**
     * **這兩支是這個 change 的核心。**
     *
     * 兩側用不同的 secret，所以跨側的 token **連簽章都驗不過**——
     * 側別的 claim 只是第二道，讓錯誤訊息說得出是哪一側的問題。
     */
    it('⭐ 後台 token 打 /api/front/me → 401', async () => {
      const res = await me(adminToken);

      expect(res.status).toBe(401);
    });

    it('⭐ 前台 token 打後台端點 → 401', async () => {
      const { data } = (await login('user1@test.com', PASSWORD))
        .body as TokenBody;

      const res = await request(app.getHttpServer())
        .get('/api/admin/members')
        .set('Authorization', `Bearer ${data.accessToken}`);

      expect(res.status).toBe(401);
    });

    it('前台 refresh 端點收到後台的 refresh token → 401', async () => {
      const adminLogin = await request(app.getHttpServer())
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: ADMIN_PASSWORD });
      const adminRefresh = (adminLogin.body as TokenBody).data.refreshToken;

      const res = await request(app.getHttpServer())
        .post('/api/front/auth/refresh')
        .send({ refreshToken: adminRefresh });

      expect(res.status).toBe(401);
    });

    it('後台登入簽出的 token 帶 side: admin', () => {
      const [, payload] = adminToken.split('.');
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64').toString('utf8'),
      ) as { side?: string };

      expect(decoded.side).toBe('admin');
    });

    it('前台登入簽出的 token 帶 side: front', async () => {
      const { data } = (await login('user1@test.com', PASSWORD))
        .body as TokenBody;
      const [, payload] = data.accessToken.split('.');
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64').toString('utf8'),
      ) as { side?: string };

      expect(decoded.side).toBe('front');
    });
  });

  describe('個人資料', () => {
    it('回傳自己的公開欄位', async () => {
      const { data } = (await login('user1@test.com', PASSWORD))
        .body as TokenBody;

      const res = await me(data.accessToken);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data as object).sort()).toEqual([
        'avatarUrl',
        'createdAt',
        'displayName',
        'email',
        'emailVerifiedAt',
        'id',
      ]);
    });

    it('未帶 token → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/front/me');

      expect(res.status).toBe(401);
    });
  });

  describe('更新與登出', () => {
    it('refresh 換發新的一對 token', async () => {
      const { data } = (await login('user1@test.com', PASSWORD))
        .body as TokenBody;

      const res = await request(app.getHttpServer())
        .post('/api/front/auth/refresh')
        .send({ refreshToken: data.refreshToken });

      expect(res.status).toBe(200);
      expect((res.body as TokenBody).data.accessToken).toBeTruthy();
    });

    it('以 access token 呼叫 refresh → 401', async () => {
      const { data } = (await login('user1@test.com', PASSWORD))
        .body as TokenBody;

      const res = await request(app.getHttpServer())
        .post('/api/front/auth/refresh')
        .send({ refreshToken: data.accessToken });

      expect(res.status).toBe(401);
    });

    it('登出回 204', async () => {
      const { data } = (await login('user1@test.com', PASSWORD))
        .body as TokenBody;

      const res = await request(app.getHttpServer())
        .post('/api/front/auth/logout')
        .set('Authorization', `Bearer ${data.accessToken}`);

      expect(res.status).toBe(204);
    });

    // 登出對客戶端必須是冪等的——token 過期時還要求先認證會讓人登不出去
    it('⭐ 以無效的 token 登出 → 仍回 204', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/front/auth/logout')
        .set('Authorization', 'Bearer not-a-real-token');

      expect(res.status).toBe(204);
    });

    it('未帶 Authorization 登出 → 401', async () => {
      const res = await request(app.getHttpServer()).post(
        '/api/front/auth/logout',
      );

      expect(res.status).toBe(401);
    });
  });
});
