import { load } from 'js-yaml';
import { collectSourceFiles, readSource } from './helpers';

/** 一條路由的正規化表示：`METHOD /api/admin/members/{id}` */
export type Route = string;

const HTTP_METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;

/**
 * 路由裝飾器 → HTTP method。
 *
 * **`@Sse()` 也是一條 GET 路由。** 原本的樣式只認五個標準動詞，
 * 於是 SSE 端點對這條守則完全隱形——而「規則本身沒錯，只是看不見新東西」
 * 正是本專案已經發生過數次的失效形狀。
 */
const ROUTE_DECORATORS = 'Get|Post|Patch|Put|Delete|Sse';

/** 由裝飾器名推出 HTTP method；`Sse` 走的是 GET */
export const methodOfDecorator = (decorator: string): string =>
  decorator === 'Sse' ? 'GET' : decorator.toUpperCase();

/** OpenAPI 文件中我們用得到的部分 */
type OpenApiDoc = {
  servers?: Array<{ url?: string }>;
  paths?: Record<string, Record<string, unknown>>;
};

/**
 * 正規化路由 path：合併重複斜線、去掉結尾斜線
 * @param path - 原始路徑
 */
const normalizePath = (path: string): string =>
  `/${path}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');

/** 解析 yaml 並取出我們用得到的欄位 */
const parseOpenApi = (file: string): OpenApiDoc => {
  // 不能用 regex 解析：多行 description 區塊的內容會被誤判成 path / method 節點
  const doc = load(readSource(file));
  return typeof doc === 'object' && doc !== null ? doc : {};
};

/**
 * 取得 OpenAPI 文件的 servers base path
 * @param file - 相對 apps/api 的 yaml 路徑
 * @returns base path，例：/api/admin
 */
export const serverBaseOf = (file: string): string => {
  const serverUrl = parseOpenApi(file).servers?.[0]?.url ?? '';
  // servers.url 可能是完整網址（取 pathname）或已是路徑
  return serverUrl.startsWith('http') ? new URL(serverUrl).pathname : serverUrl;
};

/**
 * 解析 OpenAPI yaml，取出「含 servers base path」的完整路由集合
 * @param file - 相對 apps/api 的 yaml 路徑
 * @returns 正規化後的路由集合
 */
export const routesFromOpenApi = (file: string): Set<Route> => {
  const parsed = parseOpenApi(file);
  const base = serverBaseOf(file);

  const routes = new Set<Route>();
  for (const [path, operations] of Object.entries(parsed.paths ?? {})) {
    for (const method of Object.keys(operations)) {
      if (HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) {
        routes.add(
          `${method.toUpperCase()} ${normalizePath(`${base}${path}`)}`,
        );
      }
    }
  }
  return routes;
};

/**
 * 從 controller 原始碼取出實際註冊的路由
 * @returns 正規化後的路由集合（`:param` 已轉為 `{param}`）
 */
export const routesFromControllers = (): Set<Route> => {
  const files = collectSourceFiles(['src/adapter/in/web'], {
    exclude: ['.spec.ts'],
  }).filter((file) => file.endsWith('Controller.ts'));

  const routes = new Set<Route>();
  for (const file of files) {
    const source = readSource(file);
    const controllerBase = /@Controller\('([^']*)'\)/.exec(source)?.[1] ?? '';

    for (const match of source.matchAll(
      new RegExp(`@(${ROUTE_DECORATORS})\\(\\s*'?([^')]*)'?\\s*\\)`, 'g'),
    )) {
      const sub = match[2].replace(/'/g, '').trim();
      const path = normalizePath(
        `/api/${[controllerBase, sub].filter(Boolean).join('/')}`,
      ).replace(/:(\w+)/g, '{$1}');
      routes.add(`${methodOfDecorator(match[1])} ${path}`);
    }
  }
  return routes;
};

/**
 * 從 openapi-typescript 產物取出 paths interface 的 key
 * @param file - 相對 apps/api 的 schema.ts 路徑（可跨 workspace）
 * @param base - 對應的 servers base path，用於補齊成完整路由
 */
export const routesFromGeneratedSchema = (
  file: string,
  base: string,
): Set<Route> => {
  const source = readSource(file);
  const start = source.indexOf('export interface paths');
  const body = source.slice(start, source.indexOf('\nexport ', start + 1));

  const routes = new Set<Route>();
  // 產物格式固定為 `    "/path": {` 後接各 method 的定義，method 為 `        post: {`
  for (const block of body.split(/\n {4}"(?=\/)/).slice(1)) {
    const path = block.slice(0, block.indexOf('"'));
    for (const method of HTTP_METHODS) {
      // 只認實際定義（`post: {`），openapi-typescript 對未定義者輸出 `post?: never`
      if (new RegExp(`\\n {8}${method}: \\{`).test(block)) {
        routes.add(
          `${method.toUpperCase()} ${normalizePath(`${base}${path}`)}`,
        );
      }
    }
  }
  return routes;
};

/** `@HttpCode(HttpStatus.X)` 用得到的常數名 → 數值 */
const HTTP_STATUS_VALUE: Record<string, number> = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
};

/** NestJS 未指定 `@HttpCode` 時的預設成功狀態：POST 為 201，其餘為 200 */
const defaultSuccessStatus = (method: string): number =>
  method === 'POST' ? 201 : 200;

/**
 * 從 controller 原始碼取出每條路由的成功狀態碼。
 *
 * `@HttpCode` 一定寫在它所屬的路由裝飾器之後、下一個路由裝飾器之前，
 * 因此以「兩個路由裝飾器之間」為搜尋窗即可正確配對。
 *
 * @returns 路由 → 成功狀態碼
 */
export const successStatusFromControllers = (): Map<Route, number> => {
  const files = collectSourceFiles(['src/adapter/in/web'], {
    exclude: ['.spec.ts'],
  }).filter((file) => file.endsWith('Controller.ts'));

  const result = new Map<Route, number>();

  for (const file of files) {
    const source = readSource(file);
    const controllerBase = /@Controller\('([^']*)'\)/.exec(source)?.[1] ?? '';

    const matches = [
      ...source.matchAll(
        new RegExp(`@(${ROUTE_DECORATORS})\\(\\s*'?([^')]*)'?\\s*\\)`, 'g'),
      ),
    ];

    matches.forEach((match, index) => {
      const method = methodOfDecorator(match[1]);
      const sub = match[2].replace(/'/g, '').trim();
      const path = normalizePath(
        `/api/${[controllerBase, sub].filter(Boolean).join('/')}`,
      ).replace(/:(\w+)/g, '{$1}');

      const windowEnd = matches[index + 1]?.index ?? source.length;
      const window = source.slice(match.index ?? 0, windowEnd);
      const httpCode = /@HttpCode\(\s*HttpStatus\.(\w+)\s*\)/.exec(window)?.[1];

      result.set(
        `${method} ${path}`,
        (httpCode ? HTTP_STATUS_VALUE[httpCode] : undefined) ??
          defaultSuccessStatus(method),
      );
    });
  }

  return result;
};

/**
 * 從 OpenAPI yaml 取出每條路由記載的 2xx 狀態碼
 * @param file - 相對 apps/api 的 yaml 路徑
 * @returns 路由 → 該路由記載的所有 2xx 狀態碼
 */
export const successStatusFromOpenApi = (
  file: string,
): Map<Route, number[]> => {
  const parsed = parseOpenApi(file);
  const base = serverBaseOf(file);
  const result = new Map<Route, number[]>();

  for (const [path, operations] of Object.entries(parsed.paths ?? {})) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) {
        continue;
      }
      const responses =
        typeof operation === 'object' &&
        operation !== null &&
        'responses' in operation
          ? operation.responses
          : undefined;
      if (typeof responses !== 'object' || responses === null) continue;

      const success = Object.keys(responses)
        .map(Number)
        .filter((code) => code >= 200 && code < 300);

      result.set(
        `${method.toUpperCase()} ${normalizePath(`${base}${path}`)}`,
        success,
      );
    }
  }

  return result;
};

/**
 * 比較兩組路由集合的差集，組成可讀報告
 * @param actual - 實際擁有的路由
 * @param expected - 應該要有的路由
 * @param labels - 兩側名稱，用於訊息
 */
export const diffRoutes = (
  actual: Set<Route>,
  expected: Set<Route>,
  labels: { actual: string; expected: string },
): string => {
  const missing = [...actual].filter((r) => !expected.has(r)).sort();
  const extra = [...expected].filter((r) => !actual.has(r)).sort();
  if (missing.length === 0 && extra.length === 0) return '';

  const lines: string[] = [];
  if (missing.length > 0) {
    lines.push(`只存在於${labels.actual}（${labels.expected}缺少）：`);
    lines.push(...missing.map((r) => `  ${r}`));
  }
  if (extra.length > 0) {
    lines.push(`只存在於${labels.expected}（${labels.actual}缺少）：`);
    lines.push(...extra.map((r) => `  ${r}`));
  }
  return lines.join('\n');
};
