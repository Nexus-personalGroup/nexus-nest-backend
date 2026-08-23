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
import { collectSourceFiles, readSource, toRelative } from './helpers';

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

  /**
   * 路由掃描以「檔案裡的第一個 `@Controller`」當前綴。
   *
   * 一個檔案放兩個 controller 時，第二個的路由會被算到第一個的前綴底下——
   * 而那是一個**看起來正常的錯誤答案**：規則照樣報「某某路由缺 yaml」，
   * 只是報的是一條不存在的路由，而真正缺的那條完全沒被提到。
   * （實際發生過：`FrontMeController` 與 `FrontAuthController` 曾同檔。）
   *
   * 與其讓掃描器變聰明，不如把慣例變成規則——每個檔案一個 controller
   * 本來就是這個 codebase 的既有寫法，只是從來沒有東西強制它。
   */
  it('每個檔案只能有一個 @Controller', () => {
    const offenders = collectSourceFiles(['src/adapter/in/web'], {
      exclude: ['.spec.ts'],
    })
      .map((file) => ({
        file,
        count: (readSource(file).match(/@Controller\(/g) ?? []).length,
      }))
      .filter((entry) => entry.count > 1)
      .map((entry) => `  ${toRelative(entry.file)}（${entry.count} 個）`);

    expect(
      offenders.length === 0
        ? ''
        : `以下檔案有多個 @Controller：\n${offenders.join(
            '\n',
          )}\n路由掃描以檔案裡的第一個 @Controller 當前綴，多個會讓後面的路由被算到錯的前綴下——\n而那是一個看起來正常的錯誤答案。請一個檔案一個 controller。`,
    ).toBe('');
  });

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

/**
 * Swagger UI 的分組（tag）必須在該文件的頂層 `tags:` 宣告。
 *
 * 沒宣告的 tag **仍然會顯示**——Swagger UI 會自己補一組，掉到最後面、
 * 沒有任何說明。症狀因此只是「順序怪怪的」，看起來不像漏掉了什麼，
 * 而新增一個模組時最容易忘的正是這一步。
 *
 * 反向也要擋：宣告了卻沒有任何端點使用的 tag，會在 UI 上留下一個空分組。
 */
describe('架構守則：Swagger 分組必須宣告', () => {
  /** 取頂層 `tags:` 區塊裡的 `- name: X` */
  const declaredTags = (file: string): string[] => {
    const source = readSource(file);
    const start = source.search(/^tags:$/m);
    if (start < 0) return [];
    // 頂層 tags 區塊到下一個頂層 key（行首非空白）為止
    const rest = source.slice(start + 'tags:'.length);
    const end = rest.search(/^\S/m);
    const block = end < 0 ? rest : rest.slice(0, end);
    return [...block.matchAll(/^\s*- name:\s*(\S+)/gm)].map((m) => m[1]);
  };

  /** 取某一側所有 path yaml 用到的 tag */
  const usedTags = (dir: string): string[] => {
    // 預設只收 .ts，這裡要的是 yaml；bundle 產物排除（它是衍生檔）
    const files = collectSourceFiles([dir], {
      extensions: ['.yaml'],
      exclude: ['.bundle.yaml'],
    });
    return [
      ...new Set(
        files.flatMap((file) =>
          [...readSource(file).matchAll(/^tags:\s*\[([^\]]+)\]/gm)].flatMap(
            (m) => m[1].split(',').map((t) => t.trim()),
          ),
        ),
      ),
    ];
  };

  const SIDES = [
    { side: 'admin', source: SOURCE.admin, dir: 'docs/swagger/admin' },
    { side: 'front', source: SOURCE.front, dir: 'docs/swagger/front' },
  ];

  it('掃描範圍有效', () => {
    for (const { source, dir } of SIDES) {
      expect(declaredTags(source).length).toBeGreaterThan(0);
      expect(usedTags(dir).length).toBeGreaterThan(0);
    }
  });

  it('每個用到的 tag 都必須宣告在頂層 tags', () => {
    const offenders: string[] = [];

    for (const { side, source, dir } of SIDES) {
      const declared = new Set(declaredTags(source));
      offenders.push(
        ...usedTags(dir)
          .filter((tag) => !declared.has(tag))
          .map((tag) => `  ${side}: ${tag}`),
      );
    }

    expect(
      offenders.length === 0
        ? ''
        : `以下 tag 沒有宣告在對應 openapi.yaml 的頂層 tags：\n${offenders.join(
            '\n',
          )}\n未宣告的分組仍會顯示，但會掉到最後面且沒有說明——那看起來只是順序怪，不像漏了東西。`,
    ).toBe('');
  });

  it('宣告了卻沒有端點使用的 tag 要清掉', () => {
    const offenders: string[] = [];

    for (const { side, source, dir } of SIDES) {
      const used = new Set(usedTags(dir));
      offenders.push(
        ...declaredTags(source)
          .filter((tag) => !used.has(tag))
          .map((tag) => `  ${side}: ${tag}`),
      );
    }

    expect(
      offenders.length === 0
        ? ''
        : `以下 tag 已宣告但沒有任何端點使用，會在 UI 留下空分組：\n${offenders.join('\n')}`,
    ).toBe('');
  });
});

/**
 * 兩份 API 文件的 `info` 必須是**這個專案的**。
 *
 * 後台那份的標題在腳手架之後**二十幾個 change 都沒人改**，一直掛著
 * `Hexagonal NestJS 後台 (Admin) API`——因為沒有人會為了寫功能去看文件的頁首。
 * 這種殘留不會壞掉任何東西，只會讓每一個打開文件的人第一眼看到別的專案的名字。
 */
describe('架構守則：API 文件的標題屬於本專案', () => {
  /** 專案顯示名。改名時只改這裡，兩份文件與這條守則一起跟著走 */
  const PROJECT_NAME = 'Nexus';

  const infoTitle = (file: string): string =>
    /^\s*title:\s*(.+)$/m.exec(readSource(file))?.[1].trim() ?? '';

  it('掃描範圍有效', () => {
    expect(infoTitle(SOURCE.admin).length).toBeGreaterThan(0);
    expect(infoTitle(SOURCE.front).length).toBeGreaterThan(0);
  });

  it('標題必須以專案名開頭', () => {
    const offenders = [SOURCE.admin, SOURCE.front]
      .filter((file) => !infoTitle(file).startsWith(PROJECT_NAME))
      .map((file) => `  ${file}: "${infoTitle(file)}"`);

    expect(
      offenders.length === 0
        ? ''
        : `以下 API 文件的標題不是本專案的：\n${offenders.join(
            '\n',
          )}\n預期以 "${PROJECT_NAME}" 開頭。腳手架模板的殘留不會讓任何東西壞掉，只會讓打開文件的人看到別的專案。`,
    ).toBe('');
  });
});
