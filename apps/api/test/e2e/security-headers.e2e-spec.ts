import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb } from '../helpers/db';

/**
 * CSP 的適用範圍：預設全站啟用，只有 Swagger UI 的路徑豁免。
 *
 * 這支驗的是**豁免的邊界**，不是「helmet 會不會設 header」。
 * 先前是全域關閉，理由「本服務為純 API + 獨立前端」在單一埠部署模式
 * 加入時就失效了——而失效不會有任何錯誤訊息。
 */
describe('安全標頭 E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createMockRedis();

  const get = (url: string) => request(app.getHttpServer()).get(url);

  beforeAll(async () => {
    ({ app } = await createE2EApp({ redis: mockRedis }));
    prisma = app.get(PrismaService);
    await resetDb(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  // 未帶 token 會是 401，但 helmet 在 guard 之前就跑完了——
  // 標頭的存在與授權結果無關，這正是要驗的
  it('一般 API 路徑帶 Content-Security-Policy', async () => {
    const res = await get('/api/admin/members');

    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('公開路徑同樣帶 CSP', async () => {
    const res = await get('/api/health');

    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('其餘 helmet 標頭沒有因為分支而掉', async () => {
    const res = await get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  // 兩條文件路徑都要驗：漏掉其中一條的症狀是「那份文件打不開」，
  // 會被當成 Swagger 壞掉去查，沒有人會想到是 CSP
  describe.each([
    ['後台', '/api/admin/docs'],
    ['前台', '/api/front/docs'],
  ])('%s 文件路徑', (_label, docsPath) => {
    it('CSP 已放寬', async () => {
      const res = await get(docsPath);

      expect(res.headers['content-security-policy']).toBeUndefined();
    });

    it('放寬不影響其餘安全標頭', async () => {
      const res = await get(docsPath);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('UI 載入的靜態資源同樣放寬', async () => {
      const res = await get(`${docsPath}/swagger-ui.css`);

      expect(res.headers['content-security-policy']).toBeUndefined();
    });
  });

  // docs-json 是 JSON 不是 UI，不需要放寬——
  // 用 startsWith('/api/admin/docs') 判斷的話會把它一起吃進來
  describe.each([
    ['後台', '/api/admin/docs-json'],
    ['前台', '/api/front/docs-json'],
  ])('%s docs-json 不在豁免範圍', (_label, jsonPath) => {
    it('仍帶 CSP', async () => {
      const res = await get(jsonPath);

      expect(res.headers['content-security-policy']).toBeDefined();
    });
  });
});
