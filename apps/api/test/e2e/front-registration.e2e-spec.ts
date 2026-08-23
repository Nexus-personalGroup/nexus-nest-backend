import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { ResponseCodes } from '@app/shared/constants/response-codes';
import {
  createE2EApp,
  createMailCatcher,
  createMockRedis,
} from '../setup/test-app';
import { resetDb, seedUser } from '../helpers/db';
import { expectApiError } from '../helpers/assertions';

const PASSWORD = 'User1234!';
const NEW_PASSWORD = 'BrandNew1234!';

type TokenBody = {
  data: { accessToken: string; user: { emailVerified: boolean } };
};

/**
 * 前台註冊、信箱驗證與密碼重設（e2e）。
 *
 * **每一支端點都是未認證可達的**——這是整個系統對外最寬的面。
 * 因此這份測試的主體不是「功能會動」，而是三件事：
 * **(a) 不洩漏帳號是否存在**、**(b) token 的用途不可互換**、
 * **(c) 未驗證的信箱聊不了天**。
 */
describe('Front Registration E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();
  const mail = createMailCatcher();

  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(`/api/front/auth/${path}`).send(body);

  const login = (email: string, password = PASSWORD) =>
    post('login', { email, password });

  const verify = (token: string) =>
    request(app.getHttpServer()).get(
      `/api/front/auth/verify-email?token=${token}`,
    );

  const registerOk = async (email: string): Promise<string> => {
    await post('register', {
      email,
      password: PASSWORD,
      displayName: '新人',
    }).expect(201);
    const token = mail.lastToken();
    if (!token) throw new Error('驗證信裡沒有 token');
    return token;
  };

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
    // 1 = 未達門檻。要測限流的個案自己覆寫
    mockRedis.throttleIncrement.mockResolvedValue(1);
    await resetDb(prisma);
  });

  describe('註冊', () => {
    it('註冊成功建立未驗證的帳號', async () => {
      const res = await post('register', {
        email: 'new@test.com',
        password: PASSWORD,
        displayName: '新人',
      });

      expect(res.status).toBe(201);
      const user = await prisma.userRecord.findFirstOrThrow({
        where: { email: 'new@test.com' },
      });
      expect(user.emailVerifiedAt).toBeNull();
    });

    it('⭐ 回應不含任何 token', async () => {
      const res = await post('register', {
        email: 'new@test.com',
        password: PASSWORD,
        displayName: '新人',
      });

      expect(JSON.stringify(res.body)).not.toContain('accessToken');
      expect(JSON.stringify(res.body)).not.toContain('refreshToken');
    });

    it('⭐ 回應不含密碼雜湊', async () => {
      const res = await post('register', {
        email: 'new@test.com',
        password: PASSWORD,
        displayName: '新人',
      });

      expect(JSON.stringify(res.body)).not.toContain('$2b$');
    });

    it('已註冊且已驗證 → 409 且不寄信', async () => {
      await seedUser(prisma, { email: 'taken@test.com', password: PASSWORD });
      mail.sendMail.mockClear();

      const res = await post('register', {
        email: 'taken@test.com',
        password: PASSWORD,
        displayName: '新人',
      });

      expectApiError(res, 409, ResponseCodes.EMAIL_ALREADY_EXISTS);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    /** 最常見的真實情境：信進了垃圾信匣，於是使用者重新註冊一次 */
    it('⭐ 已註冊但未驗證 → 409 但重發驗證信，密碼不被覆蓋', async () => {
      await seedUser(prisma, {
        email: 'pending@test.com',
        password: PASSWORD,
        verified: false,
      });
      const before = await prisma.userRecord.findFirstOrThrow({
        where: { email: 'pending@test.com' },
      });
      mail.sendMail.mockClear();

      const res = await post('register', {
        email: 'pending@test.com',
        password: 'CompletelyOther9!',
        displayName: '別人',
      });

      expectApiError(res, 409, ResponseCodes.EMAIL_ALREADY_EXISTS);
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      const after = await prisma.userRecord.findFirstOrThrow({
        where: { email: 'pending@test.com' },
      });
      expect(after.password).toBe(before.password);
      expect(after.displayName).toBe(before.displayName);
    });

    it('⭐ 大小寫不同視為同一個信箱', async () => {
      await seedUser(prisma, { email: 'foo@x.com', password: PASSWORD });

      const res = await post('register', {
        email: '  Foo@X.com ',
        password: PASSWORD,
        displayName: '新人',
      });

      expectApiError(res, 409, ResponseCodes.EMAIL_ALREADY_EXISTS);
    });

    it('密碼未通過政策 → 400 且不建立帳號', async () => {
      const res = await post('register', {
        email: 'weak@test.com',
        password: 'abc',
        displayName: '新人',
      });

      expect(res.status).toBe(400);
      expect(await prisma.userRecord.count()).toBe(0);
    });
  });

  describe('信箱驗證', () => {
    it('⭐ 註冊 → 點信裡的連結 → 可以聊天', async () => {
      const token = await registerOk('flow@test.com');

      const res = await verify(token);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('result=success');

      const { body } = await login('flow@test.com').expect(200);
      const { accessToken, user } = (body as TokenBody).data;
      expect(user.emailVerified).toBe(true);
      await request(app.getHttpServer())
        .get('/api/front/chat-rooms')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    /**
     * 信件的預抓與郵件安全掃描會在使用者點擊之前把 token 用掉。
     * 對他顯示失敗是讓他為自己沒做錯的事負責，而且重發也沒用。
     */
    it('⭐ 重複點同一個連結 → 仍是 success', async () => {
      const token = await registerOk('twice@test.com');
      await verify(token).expect(302);

      const res = await verify(token);

      expect(res.headers.location).toContain('result=success');
    });

    it('token 不存在 → result=invalid', async () => {
      const res = await verify('deadbeefdeadbeef');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('result=invalid');
    });

    it('⭐ 失敗也是 302，不是 JSON', async () => {
      const res = await verify('deadbeefdeadbeef');

      expect(res.status).toBe(302);
      expect(res.body).toEqual({});
    });

    it('⭐ 重發之後舊的連結失效', async () => {
      const first = await registerOk('resend@test.com');
      await post('resend-verification', { email: 'resend@test.com' }).expect(
        204,
      );
      const second = mail.lastToken();

      expect(second).not.toBe(first);
      expect((await verify(first)).headers.location).toContain(
        'result=expired',
      );
      expect((await verify(second!)).headers.location).toContain(
        'result=success',
      );
    });
  });

  /**
   * 帳號列舉：**回應的狀態碼與 body 必須完全相同**。
   * 這兩支沒有「給使用者有用的回饋」這個需求可以拿來抵消風險。
   */
  describe('⭐ 不洩漏帳號是否存在', () => {
    beforeEach(async () => {
      await seedUser(prisma, {
        email: 'known@test.com',
        password: PASSWORD,
        verified: false,
      });
    });

    it('重發驗證信：存在與不存在的回應一致', async () => {
      const known = await post('resend-verification', {
        email: 'known@test.com',
      });
      const ghost = await post('resend-verification', {
        email: 'ghost@test.com',
      });

      expect(known.status).toBe(204);
      expect(ghost.status).toBe(known.status);
      expect(ghost.body).toEqual(known.body);
    });

    it('忘記密碼：存在與不存在的回應一致', async () => {
      const known = await post('forgot-password', { email: 'known@test.com' });
      const ghost = await post('forgot-password', { email: 'ghost@test.com' });

      expect(known.status).toBe(204);
      expect(ghost.status).toBe(known.status);
      expect(ghost.body).toEqual(known.body);
    });

    it('已驗證的帳號重發 → 一樣 204 但不寄信', async () => {
      await seedUser(prisma, { email: 'done@test.com', password: PASSWORD });
      mail.sendMail.mockClear();

      const res = await post('resend-verification', {
        email: 'done@test.com',
      });

      expect(res.status).toBe(204);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('密碼重設', () => {
    const requestReset = async (email: string): Promise<string> => {
      await post('forgot-password', { email }).expect(204);
      const token = mail.lastToken();
      if (!token) throw new Error('重設信裡沒有 token');
      return token;
    };

    beforeEach(async () => {
      await seedUser(prisma, { email: 'reset@test.com', password: PASSWORD });
    });

    it('重設後新密碼可登入、舊密碼失敗', async () => {
      const token = await requestReset('reset@test.com');

      await post('reset-password', {
        token,
        password: NEW_PASSWORD,
      }).expect(204);

      await login('reset@test.com', NEW_PASSWORD).expect(200);
      const old = await login('reset@test.com', PASSWORD);
      expect(old.status).not.toBe(200);
    });

    /** 會走到忘記密碼的情境本來就包含「帳號可能正被別人用著」 */
    it('⭐ 重設會讓既有的 access token 立即失效', async () => {
      const { body } = await login('reset@test.com').expect(200);
      const oldToken = (body as TokenBody).data.accessToken;
      const token = await requestReset('reset@test.com');

      await post('reset-password', {
        token,
        password: NEW_PASSWORD,
      }).expect(204);

      await request(app.getHttpServer())
        .get('/api/front/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(401);
    });

    it('token 不可重複使用', async () => {
      const token = await requestReset('reset@test.com');
      await post('reset-password', {
        token,
        password: NEW_PASSWORD,
      }).expect(204);

      const res = await post('reset-password', {
        token,
        password: 'Another1234!',
      });

      expectApiError(res, 400, ResponseCodes.INVALID_TOKEN);
    });

    it('⭐ 未驗證的帳號也能重設密碼', async () => {
      await seedUser(prisma, {
        email: 'unverified@test.com',
        password: PASSWORD,
        verified: false,
      });
      const token = await requestReset('unverified@test.com');

      await post('reset-password', {
        token,
        password: NEW_PASSWORD,
      }).expect(204);
      await login('unverified@test.com', NEW_PASSWORD).expect(200);
    });

    it('⭐ 過期與不存在的 token 不可區分', async () => {
      const missing = await post('reset-password', {
        token: 'deadbeef',
        password: NEW_PASSWORD,
      });
      const used = await (async () => {
        const token = await requestReset('reset@test.com');
        await post('reset-password', { token, password: NEW_PASSWORD });
        return post('reset-password', { token, password: 'Another1234!' });
      })();

      expect(missing.status).toBe(used.status);
      expect((missing.body as { code: string }).code).toBe(
        (used.body as { code: string }).code,
      );
    });
  });

  /**
   * token 的用途不可互換。少了查詢條件裡的 `purpose`，
   * 拿驗證信的 token 就能改密碼——而那不會有任何徵兆。
   */
  describe('⭐ token 的用途不可互換', () => {
    it('拿密碼重設的 token 去驗證信箱 → invalid', async () => {
      await seedUser(prisma, {
        email: 'cross@test.com',
        password: PASSWORD,
        verified: false,
      });
      await post('forgot-password', { email: 'cross@test.com' }).expect(204);
      const resetToken = mail.lastToken()!;

      const res = await verify(resetToken);

      expect(res.headers.location).toContain('result=invalid');
      const user = await prisma.userRecord.findFirstOrThrow({
        where: { email: 'cross@test.com' },
      });
      expect(user.emailVerifiedAt).toBeNull();
    });

    it('拿驗證信的 token 去改密碼 → 400 且密碼不變', async () => {
      const verifyToken = await registerOk('cross2@test.com');
      const before = await prisma.userRecord.findFirstOrThrow({
        where: { email: 'cross2@test.com' },
      });

      const res = await post('reset-password', {
        token: verifyToken,
        password: NEW_PASSWORD,
      });

      expectApiError(res, 400, ResponseCodes.INVALID_TOKEN);
      const after = await prisma.userRecord.findFirstOrThrow({
        where: { email: 'cross2@test.com' },
      });
      expect(after.password).toBe(before.password);
    });
  });

  /** 未驗證的帳號：登得進來、看得到自己，但聊不了天 */
  describe('⭐ 未驗證信箱的門檻', () => {
    let token = '';

    beforeEach(async () => {
      await seedUser(prisma, {
        email: 'gate@test.com',
        password: PASSWORD,
        verified: false,
      });
      const { body } = await login('gate@test.com').expect(200);
      token = (body as TokenBody).data.accessToken;
    });

    const auth = (method: 'get' | 'post', path: string) =>
      request(app.getHttpServer())
        [method](path)
        .set('Authorization', `Bearer ${token}`);

    it('登入成功且 emailVerified 為 false', async () => {
      const { body } = await login('gate@test.com');

      expect((body as TokenBody).data.user.emailVerified).toBe(false);
    });

    it('看得到自己', async () => {
      const res = await auth('get', '/api/front/me');

      expect(res.status).toBe(200);
      expect(
        (res.body as { data: { emailVerified: boolean } }).data.emailVerified,
      ).toBe(false);
    });

    it('列出聊天室 → 403 EMAIL_NOT_VERIFIED', async () => {
      expectApiError(
        await auth('get', '/api/front/chat-rooms'),
        403,
        ResponseCodes.EMAIL_NOT_VERIFIED,
      );
    });

    it('建立私聊 → 403 EMAIL_NOT_VERIFIED', async () => {
      expectApiError(
        await auth('post', '/api/front/chat-rooms/direct'),
        403,
        ResponseCodes.EMAIL_NOT_VERIFIED,
      );
    });

    it('檢舉 → 403 EMAIL_NOT_VERIFIED', async () => {
      expectApiError(
        await auth('post', '/api/front/chat-reports'),
        403,
        ResponseCodes.EMAIL_NOT_VERIFIED,
      );
    });

    /** 驗證狀態每次請求重新解析，不快取在 token 裡 */
    it('⭐ 驗證後**同一個** token 立刻可用，不必重新登入', async () => {
      await post('resend-verification', { email: 'gate@test.com' }).expect(204);
      await verify(mail.lastToken()!).expect(302);

      const res = await auth('get', '/api/front/chat-rooms');

      expect(res.status).toBe(200);
    });
  });

  describe('⭐ 信箱限流', () => {
    it('超過額度 → 429 且不寄信', async () => {
      mockRedis.throttleIncrement.mockResolvedValue(99);
      mail.sendMail.mockClear();

      const res = await post('resend-verification', {
        email: 'anything@test.com',
      });

      expect(res.status).toBe(429);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('註冊也受限流', async () => {
      mockRedis.throttleIncrement.mockResolvedValue(99);

      const res = await post('register', {
        email: 'limited@test.com',
        password: PASSWORD,
        displayName: '新人',
      });

      expect(res.status).toBe(429);
      expect(await prisma.userRecord.count()).toBe(0);
    });

    /**
     * 只對存在的帳號計數的話，Redis 的計數狀態就成了
     * 「這個信箱有沒有註冊」的旁通道。
     */
    it('⭐ 帳號不存在時額度照樣扣', async () => {
      mockRedis.throttleIncrement.mockClear();

      await post('forgot-password', { email: 'ghost@test.com' }).expect(204);

      const keys = mockRedis.throttleIncrement.mock.calls.map(
        (call) => call[0] as string,
      );
      expect(keys.some((key) => key.includes('ghost@test.com'))).toBe(true);
    });
  });
});
