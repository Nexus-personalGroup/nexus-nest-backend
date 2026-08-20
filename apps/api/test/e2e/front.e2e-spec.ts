import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createE2EApp, createMockRedis } from '../setup/test-app';

// 前台骨架示範端點：公開（免 JWT），驗證 /api/front 路由與 @Public 放行。
describe('Front Ping E2E', () => {
  let app: NestExpressApplication;
  const mockRedis = createMockRedis();

  beforeAll(async () => {
    ({ app } = await createE2EApp({ redis: mockRedis }));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.isTokenBlacklisted.mockResolvedValue(false);
    mockRedis.throttleIncrement.mockResolvedValue(1);
  });

  it('GET /api/front/ping → 200 + { message }（公開，免 JWT）', async () => {
    const res = await request(app.getHttpServer()).get('/api/front/ping');

    expect(res.status).toBe(200);
    expect((res.body as { data: { message: string } }).data.message).toBe(
      '前台 API 運作中',
    );
  });
});
