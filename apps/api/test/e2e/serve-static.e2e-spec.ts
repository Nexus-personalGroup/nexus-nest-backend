import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createE2EApp, createMockRedis } from '../setup/test-app';

// ──────────────────────────────────────────────
// 驗證單一埠部署：api 服務前端靜態檔 + SPA fallback，同時不攔截 /api 路由。
// fixture 由 WEB_STATIC_ROOT（setup-env 指定）指向，beforeAll 先放 index.html，
// 才讓 AppModule 的 forRootAsync 在 init 時偵測到並掛載（含 forceServeStatic 對齊生產 loader）。
// ──────────────────────────────────────────────
const WEB_DIST = process.env.WEB_STATIC_ROOT ?? '';
const INDEX_MARKER = 'web-dist-fixture';
const INDEX_HTML = `<!doctype html><title>${INDEX_MARKER}</title>`;

describe('ServeStatic 單一埠 (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    mkdirSync(WEB_DIST, { recursive: true });
    writeFileSync(join(WEB_DIST, 'index.html'), INDEX_HTML);
    writeFileSync(join(WEB_DIST, 'robots.txt'), 'static-asset-marker');
    // 本 spec 不碰 DB，但仍用真 PrismaService——與其餘 e2e 一致（不 mock 資料庫）
    ({ app } = await createE2EApp({
      redis: createMockRedis(),
      forceServeStatic: true,
    }));
  });

  afterAll(async () => {
    await app.close();
    rmSync(WEB_DIST, { recursive: true, force: true });
  });

  it('根路徑回前端 index.html', async () => {
    const res = await request(app.getHttpServer()).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain(INDEX_MARKER);
  });

  it('前端深層路由（SPA fallback）回 index.html', async () => {
    const res = await request(app.getHttpServer()).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.text).toContain(INDEX_MARKER);
  });

  it('實際存在的靜態檔直接服務', async () => {
    const res = await request(app.getHttpServer()).get('/robots.txt');

    expect(res.status).toBe(200);
    expect(res.text).toContain('static-asset-marker');
  });

  it('/api 路由不被 SPA fallback 攔截，仍回 JSON', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('未知 /api 路由回 404 且不是 index.html', async () => {
    const res = await request(app.getHttpServer()).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.text).not.toContain(INDEX_MARKER);
  });
});
