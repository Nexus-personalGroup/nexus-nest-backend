import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  createE2EApp,
  createMailCatcher,
  createMockRedis,
} from '../setup/test-app';
import { resetDb, seedUser } from '../helpers/db';

const EMAIL = 'throttled@example.com';
const PASSWORD = 'User1234!';

/**
 * 計數器回這個值時：**端點層的額度（3～10）擋得住，全域的 100 擋不住**。
 *
 * 這是本檔的核心手法。既有 e2e 驗節流的寫法是把計數器 mock 成極大值
 * （`mockResolvedValue(1_000_000)`），那能驗「有沒有套節流」，
 * 但**驗不到額度是多少**——把端點額度改成 200 照樣會被擋，測試不會紅。
 *
 * 取一個介於兩者之間的值，「端點額度必須明顯小於全域」才變成可驗證的：
 * 額度一旦調到 ≥ 50，這裡就會漏過去。
 */
const BETWEEN_ENDPOINT_AND_GLOBAL = 50;

/**
 * 只讓 **HTTP 端點節流** 的計數器衝高，寄信限流的維持在 1。
 *
 * 兩者共用同一支 `throttleIncrement`（`RedisEmailSendRateLimitAdapter` 刻意重用它，
 * 理由是原子性）。全部一起衝高的話，register / resend-verification / forgot-password
 * 的 429 會**來自寄信限流而不是端點節流**——那三條斷言就變成
 * 「沒有 `@Throttle` 也會通過」的假測試。這是反向驗證抓出來的。
 *
 * 寄信限流的 key 是 `email-rate:<purpose>:<email>`（見 `buildEmailSendRateKey`）。
 */
const onlyEndpointThrottle = (key: string): Promise<number> =>
  Promise.resolve(
    key.includes('email-rate:') ? 1 : BETWEEN_ENDPOINT_AND_GLOBAL,
  );

/**
 * 前台 auth 的端點層節流。
 *
 * 在此之前**八支端點一個 `@Throttle` 都沒有**，唯一防護是全域的
 * 100 次／分鐘／IP——對登入而言那是每天十四萬次密碼嘗試，
 * 對註冊而言是每分鐘一百個帳號。
 *
 * **「有全域節流」不等於「這支端點被保護了」**，而那個差別
 * 不會在任何測試裡出現，只會在被利用的時候出現。
 */
describe('Front Auth 節流 E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();
  const mail = createMailCatcher();

  const frontPost = (path: string, body: object) =>
    request(app.getHttpServer()).post(`/api/front/auth/${path}`).send(body);

  beforeAll(async () => {
    ({ app } = await createE2EApp({ redis: mockRedis, sendEmail: mail }));
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
    mail.sendMail.mockClear();
    await resetDb(prisma);
    await seedUser(prisma, {
      email: EMAIL,
      password: PASSWORD,
      verified: true,
    });
  });

  describe('額度小於全域預設', () => {
    beforeEach(() => {
      mockRedis.throttleIncrement.mockImplementation(onlyEndpointThrottle);
    });

    it('⭐ 登入被端點層額度擋下', async () => {
      const res = await frontPost('login', {
        email: EMAIL,
        password: PASSWORD,
      });

      expect(res.status).toBe(429);
    });

    it('⭐ 註冊被端點層額度擋下，且沒有建立帳號、沒有寄信', async () => {
      const res = await frontPost('register', {
        email: 'brand-new@example.com',
        password: PASSWORD,
        displayName: '小明',
      });

      expect(res.status).toBe(429);
      expect(
        await prisma.userRecord.count({
          where: { email: 'brand-new@example.com' },
        }),
      ).toBe(0);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it.each([
      ['resend-verification', { email: EMAIL }],
      ['forgot-password', { email: EMAIL }],
      ['reset-password', { token: 'x'.repeat(32), password: PASSWORD }],
      ['refresh', { refreshToken: 'x' }],
      ['logout', {}],
    ])('%s 同樣有端點層節流', async (path, body) => {
      const res = await frontPost(path, body);

      expect(res.status).toBe(429);
    });

    it('verify-email 同樣有端點層節流', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/front/auth/verify-email?token=abc',
      );

      expect(res.status).toBe(429);
    });

    /**
     * 對照組：**同樣的計數，後台登入沒有被擋**。
     *
     * 它只受全域的 100 保護，所以 50 過得去。這證明前台被擋下來的
     * 是**端點層的額度**而不是全域那一層——沒有這一條，
     * 上面那些斷言在「額度設成 200」時也會通過。
     */
    it('⭐ 對照：只受全域保護的端點在同樣計數下沒有被擋', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever' });

      expect(res.status).not.toBe(429);
    });
  });

  it('計數未超過額度時正常放行', async () => {
    mockRedis.throttleIncrement.mockResolvedValue(1);

    const res = await frontPost('login', { email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);
  });
});
