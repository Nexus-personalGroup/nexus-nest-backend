import { resolveSwaggerEnabled } from './validate-env';

/**
 * Swagger 的掛載開關。
 *
 * 掛載本身在 `main.ts` 的 bootstrap 裡（`app.use()` 的原生 middleware），
 * e2e 的 `createE2EApp` 不會走到那段——因此這裡驗的是**決定**，
 * 掛載的實際行為由 smoke-test 人工確認。
 */
describe('resolveSwaggerEnabled', () => {
  /**
   * 固定預設 true 會讓忘記設定的 production 裸奔。
   *
   * `/api/admin/docs-json` 是一份完整的後台地圖（所有端點、參數 schema、錯誤碼、
   * 權限碼命名），而它掛在 `app.use()` 上，全域 JwtAuthGuard 根本碰不到
   * （Nest 的 guard 只作用於 Nest 路由）。
   */
  it('⭐ production 未設定 → 關閉', () => {
    expect(resolveSwaggerEnabled('production', undefined)).toBe(false);
  });

  // 固定預設 false 會讓開發者第一次跑起來就找不到文件
  it('開發環境未設定 → 開啟', () => {
    expect(resolveSwaggerEnabled('development', undefined)).toBe(true);
  });

  it('test 環境未設定 → 開啟', () => {
    expect(resolveSwaggerEnabled('test', undefined)).toBe(true);
  });

  // 明確設定永遠優先於環境推導
  it('production 明確開啟 → 開啟', () => {
    expect(resolveSwaggerEnabled('production', 'true')).toBe(true);
  });

  it('開發環境明確關閉 → 關閉', () => {
    expect(resolveSwaggerEnabled('development', 'false')).toBe(false);
  });
});
