import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createE2EApp, createMockRedis } from '../setup/test-app';

// 走真 test DB：DbHealthIndicator 的 `SELECT 1` 打真連線；Redis 仍 mock。
describe('Health (e2e)', () => {
  describe('GET /api/health（liveness）', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      ({ app } = await createE2EApp({ redis: createMockRedis() }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('永遠回 200 且不查外部依賴', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(typeof res.body.data.timestamp).toBe('string');
    });
  });

  describe('GET /api/health/ready（readiness）', () => {
    it('DB（真連線）與 Redis 皆正常時回 200，details 標記 up', async () => {
      const { app } = await createE2EApp({ redis: createMockRedis() });

      const res = await request(app.getHttpServer()).get('/api/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.details.database.status).toBe('up');
      expect(res.body.data.details.redis.status).toBe('up');

      await app.close();
    });

    it('Redis 無回應時回 503', async () => {
      const redis = createMockRedis();
      redis.ping.mockResolvedValue(false);

      const { app } = await createE2EApp({ redis });

      const res = await request(app.getHttpServer()).get('/api/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('SERVICE_UNAVAILABLE');

      await app.close();
    });

    // 「DB 查詢失敗 → 503」由 DbHealthIndicator.spec.ts（unit）涵蓋；
    // 真 DB e2e 無法模擬 DB 故障，故此案例不在 e2e 重複。
  });
});
