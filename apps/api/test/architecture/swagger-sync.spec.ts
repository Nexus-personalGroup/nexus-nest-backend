import {
  diffRoutes,
  routesFromControllers,
  routesFromGeneratedSchema,
  routesFromOpenApi,
  serverBaseOf,
  successStatusFromControllers,
  successStatusFromOpenApi,
  type Route,
} from './swagger-helpers';
import { SWAGGER_EXEMPT_ROUTES } from './allowlist';

const SOURCE = {
  admin: 'docs/swagger/admin/openapi.yaml',
  front: 'docs/swagger/front/openapi.yaml',
};
const BUNDLE = {
  admin: 'docs/swagger/admin/openapi.bundle.yaml',
  front: 'docs/swagger/front/openapi.bundle.yaml',
};
const GENERATED = '../../packages/api-client/src/schema.ts';

/** 合併多份 OpenAPI 文件的路由 */
const union = (files: string[]): Set<Route> =>
  new Set(files.flatMap((file) => [...routesFromOpenApi(file)]));

/**
 * API 契約從實作流到前端要經過三段轉換，只有最後一段受 TypeScript 保護：
 *
 *   Controller → 來源 yaml → openapi.bundle.yaml → api-client/schema.ts → 前端
 *              └ 人工同步 ┘ └ swagger:bundle ┘  └ generate ┘        └ TS ┘
 *
 * 前三段任一環節漏掉都是靜默不同步，只有前端在執行期拿到錯型別時才會發現。
 * 此處以「路由集合」為單位比對；路由沒變但 schema 內容變了的情形由 swagger:check 涵蓋。
 */
describe('架構守則：API 契約三段轉換同步', () => {
  const controllerRoutes = routesFromControllers();
  const sourceRoutes = union([SOURCE.admin, SOURCE.front]);
  const bundleRoutes = union([BUNDLE.admin, BUNDLE.front]);
  const exemptRoutes = SWAGGER_EXEMPT_ROUTES.map((item) => item.route);

  it('掃描範圍有效', () => {
    expect(controllerRoutes.size).toBeGreaterThan(0);
    expect(sourceRoutes.size).toBeGreaterThan(0);
    expect(bundleRoutes.size).toBeGreaterThan(0);
  });

  it('controller 路由與來源 yaml 一致', () => {
    const declared = new Set([...sourceRoutes, ...exemptRoutes]);

    const report = diffRoutes(controllerRoutes, declared, {
      actual: ' controller',
      expected: ' swagger 來源 yaml',
    });

    expect(
      report &&
        `${report}\n→ 新增 endpoint 請補寫 docs/swagger/<side>/ 的 yaml；刻意不列入文件者加進 allowlist.ts 的 SWAGGER_EXEMPT_ROUTES`,
    ).toBe('');
  });

  it('來源 yaml 與 bundle 一致（改了 yaml 要重跑 swagger:bundle）', () => {
    const report = diffRoutes(sourceRoutes, bundleRoutes, {
      actual: ' 來源 yaml',
      expected: ' bundle',
    });

    expect(
      report && `${report}\n→ 請執行：pnpm --filter @app/api swagger:bundle`,
    ).toBe('');
  });

  it('bundle 與 api-client 產物一致（bundle 更新要重跑 generate）', () => {
    // api-client 目前只生成 admin 側型別
    const adminBundle = routesFromOpenApi(BUNDLE.admin);
    const generated = routesFromGeneratedSchema(
      GENERATED,
      serverBaseOf(BUNDLE.admin),
    );

    const report = diffRoutes(adminBundle, generated, {
      actual: ' bundle',
      expected: ' api-client/schema.ts',
    });

    expect(
      report && `${report}\n→ 請執行：pnpm --filter @app/api-client generate`,
    ).toBe('');
  });

  it('成功狀態碼與 controller 的 @HttpCode 一致', () => {
    const actual = successStatusFromControllers();
    // 讀 bundle 而非來源 yaml：來源每條路由都是 `$ref` 到獨立檔案，responses 不在檔內。
    // 來源與 bundle 的內容漂移由 swagger:check 涵蓋（它重生到 tmp 再 diff）。
    const documented = new Map([
      ...successStatusFromOpenApi(BUNDLE.admin),
      ...successStatusFromOpenApi(BUNDLE.front),
    ]);

    const mismatched: string[] = [];
    let compared = 0;

    for (const [route, status] of actual) {
      const declared = documented.get(route);
      // 未列入文件的路由由「controller 路由與來源 yaml 一致」那條負責
      if (declared === undefined) continue;
      compared += 1;

      if (!declared.includes(status)) {
        mismatched.push(
          `  ${route}\n    controller: ${status}    yaml: ${declared.join(' / ') || '（未記載 2xx）'}`,
        );
      }
    }

    // 正規式或路由正規化失效時，這條規則會靜默空轉
    expect(compared).toBeGreaterThan(0);

    expect(
      mismatched.length === 0
        ? ''
        : `以下 endpoint 的成功狀態碼與 yaml 記載不符：\n${mismatched.join(
            '\n',
          )}\n→ 以 controller 的 @HttpCode 為準修正 yaml，再跑 swagger:bundle 與 api-client generate。\n  204 代表沒有回應主體，yaml 不可寫成帶 data 的 200。`,
    ).toBe('');
  });

  it('swagger 豁免清單不得有過期項目', () => {
    const expired = exemptRoutes
      .filter((route) => !controllerRoutes.has(route))
      .map((route) => `  ${route} 已不存在於 controller`);

    expect(
      expired.length === 0
        ? ''
        : `以下 swagger 豁免已過期：請從 allowlist.ts 的 SWAGGER_EXEMPT_ROUTES 移除\n${expired.join('\n')}`,
    ).toBe('');
  });
});
