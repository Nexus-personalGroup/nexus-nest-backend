import { readFileSync } from 'fs';
import { join } from 'path';
import { collectSourceFiles, readSource, violationReport } from './helpers';
import { ENV_EXEMPT_NAMES } from './allowlist';

const ENV_FILE = 'src/infrastructure/validate-env.ts';
const EXAMPLE_FILE = '.env.example';
/** compose 與容器內的 env 都在 repo 根，不在 apps/api 底下 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const COMPOSE_FILE = 'compose.yml';
const CONTAINER_ENV_FILE = 'docker/api.container.env';

/** 取出 `KEY=` 形式宣告的變數名（含被註解掉的，那些也是文件的一部分） */
const keysFromEnvFile = (path: string, fromRepoRoot = false): string[] => {
  const full = fromRepoRoot
    ? join(REPO_ROOT, path)
    : join(__dirname, '..', '..', path);
  return [
    ...readFileSync(full, 'utf8').matchAll(/^#?\s?([A-Z][A-Z0-9_]*)=/gm),
  ].map((match) => match[1]);
};

/**
 * compose.yml 的 **api 服務**在 `environment:` 底下注入的變數名。
 *
 * **只掃 api 這一段**：postgres / redis 服務的 `environment` 是那些映像自己的變數
 * （`POSTGRES_USER`、`PGDATA`…），本來就不該出現在後端的 envSchema 裡。
 * 掃整份 compose 會讓規則對著一堆正當的東西報錯，而那種規則會被關掉。
 *
 * `VITE_` / `TSC_` 開頭的是前端與工具鏈的變數，同樣不經過 envSchema。
 */
const keysFromCompose = (): string[] => {
  const source = readFileSync(join(REPO_ROOT, COMPOSE_FILE), 'utf8');
  const start = source.indexOf('\n  api:');
  // 下一個同層服務（兩格縮排）就是 api 區塊的結尾
  const end = source.indexOf('\n  web:', start);
  const apiBlock = source.slice(start, end === -1 ? undefined : end);

  return [...apiBlock.matchAll(/^ {6}([A-Z][A-Z0-9_]*):/gm)]
    .map((match) => match[1])
    .filter((key) => !key.startsWith('VITE_') && !key.startsWith('TSC_'));
};

/** 取出 envSchema = z.object({ ... }) 區塊中宣告的環境變數名稱 */
const declaredEnvKeys = (): string[] => {
  const source = readSource(ENV_FILE);
  const start = source.indexOf('const envSchema = z.object({');
  const body = source.slice(start, source.indexOf('\n});', start));
  return [...body.matchAll(/^\s{2}([A-Z][A-Z_0-9]*):/gm)].map((m) => m[1]);
};

/**
 * Hard Rule：任何環境變數都必須經過 envSchema 驗證。
 *
 * 漏宣告不會有錯誤訊息，只會在執行期靜默變成 undefined —— 對「是否啟用某項防護」
 * 這類旗標而言，靜默的 undefined 等於預設關閉，是最難察覺的一種失效。
 */
describe('架構守則：環境變數必須宣告於 envSchema', () => {
  const declared = declaredEnvKeys();
  const files = collectSourceFiles(['src', 'scripts', 'seeds'], {
    exclude: ['.spec.ts'],
  });

  const used = new Map<string, { file: string; line: number }>();
  for (const file of files) {
    readSource(file)
      .split('\n')
      .forEach((text, index) => {
        for (const match of text.matchAll(/process\.env\.([A-Z][A-Z_0-9]*)/g)) {
          if (!used.has(match[1])) {
            used.set(match[1], { file, line: index + 1 });
          }
        }
      });
  }

  /**
   * `.env.example` 是**文件**：schema 有而它沒有的變數，等於那個開關不存在——
   * 沒有人知道可以調它。這條規則存在的理由就是它自己：
   * `WS_CONNECTION_EVENT_*` 進 schema 之後始終沒進 `.env.example`，
   * 而沒有任何東西會提醒。
   */
  it('.env.example 必須涵蓋 envSchema 的每一個變數', () => {
    const documented = new Set(keysFromEnvFile(EXAMPLE_FILE));
    const missing = declared.filter((key) => !documented.has(key));

    expect(
      missing.length === 0
        ? ''
        : `以下變數在 envSchema 中宣告卻不在 .env.example：\n${missing
            .map((key) => `  ${key}`)
            .join('\n')}\n沒有寫進範本的變數等於不存在——沒有人知道可以調它`,
    ).toBe('');
  });

  it('compose.yml 注入的變數都必須在 envSchema 中', () => {
    const unknown = keysFromCompose().filter((key) => !declared.includes(key));

    expect(
      unknown.length === 0
        ? ''
        : `compose.yml 注入了 envSchema 沒有宣告的變數：\n${unknown
            .map((key) => `  ${key}`)
            .join('\n')}\n未宣告的變數在執行期是靜默的 undefined`,
    ).toBe('');
  });

  it('docker/api.container.env 的變數都必須在 envSchema 中', () => {
    const unknown = keysFromEnvFile(CONTAINER_ENV_FILE, true).filter(
      (key) => !declared.includes(key),
    );

    expect(
      unknown.length === 0
        ? ''
        : `docker/api.container.env 設了 envSchema 沒有宣告的變數：\n${unknown
            .map((key) => `  ${key}`)
            .join('\n')}`,
    ).toBe('');
  });

  it('掃描範圍有效', () => {
    expect(declared.length).toBeGreaterThan(0);
    // 讀不到 .env.example 或解析失效時，上面那條規則會空轉成「全部都有」
    expect(keysFromEnvFile(EXAMPLE_FILE).length).toBeGreaterThan(0);
    expect(keysFromCompose().length).toBeGreaterThan(0);
    expect(used.size).toBeGreaterThan(0);
  });

  /**
   * 布林變數必須用列舉宣告。
   *
   * `z.string().default('false').transform((v) => v === 'true')` 把**任何非 `'true'`
   * 的值都當成 false**：`FOO=TRUE`（大寫）、`=1`、`=yes` 全都靜默失效。
   * 對預設關閉的開關只是沒生效，對預設開啟的安全性開關（如稽核）則是**靜默關掉了它**。
   *
   * 判定必須認得 transform 前面接的是 `.string()` 還是 `.enum()`——
   * 接在 `z.enum` 後面是**正確**寫法（列舉負責驗證、transform 負責轉成 boolean），
   * 誤報會逼人把守則關掉。
   *
   * 也不得改用 `z.coerce.boolean()`：它走 JS truthy 規則，而 `'false'` 是非空字串，
   * `FOO=false` 會變成 `true`——比寬鬆寫法更糟。
   */
  it('布林環境變數必須以 z.enum 宣告，不得用 z.string()', () => {
    const body = readSource(ENV_FILE);
    const BOOL_TRANSFORM = /\.transform\(\(v\) => v === 'true'\)/g;
    const LOOSE =
      /\.string\(\)\s*\n\s*\.(?:default\('(?:true|false)'\)|optional\(\))\s*\n\s*\.transform\(\(v\) => v === 'true'\)/g;

    // 一個布林宣告都掃不到 → 正規式或檔案結構變了，這條規則會空轉
    expect(body.match(BOOL_TRANSFORM)?.length ?? 0).toBeGreaterThan(0);

    const loose = body.match(LOOSE) ?? [];
    expect(
      loose.length === 0
        ? ''
        : `${ENV_FILE} 有 ${loose.length} 處布林變數用 z.string() 宣告：\n` +
            `  改成 z.enum(['true', 'false'])，.default() 的值保持原樣。\n` +
            `  z.string() 會把 TRUE / 1 / yes 靜默當成 false——對預設開啟的安全性開關` +
            `\n  等於悄悄關掉它。也不要改用 z.coerce.boolean()：'false' 是非空字串，會變成 true`,
    ).toBe('');
  });

  it('不得使用 z.coerce.boolean()', () => {
    expect(readSource(ENV_FILE)).not.toMatch(/z\.coerce\.boolean\(\)/);
  });

  it('使用到的 process.env 都必須宣告於 envSchema', () => {
    const undeclared = [...used.entries()]
      .filter(
        ([name]) =>
          !declared.includes(name) && !ENV_EXEMPT_NAMES.includes(name),
      )
      .map(([name, at]) => ({
        file: at.file,
        line: at.line,
        text: `${name} 未宣告於 envSchema`,
      }));

    expect(
      violationReport(
        undeclared,
        `以下環境變數未經驗證，執行期會靜默成 undefined：請加入 ${ENV_FILE} 的 envSchema（正式環境必填者一併加進 productionErrors）`,
      ),
    ).toBe('');
  });

  it('env 豁免清單不得有過期項目', () => {
    const expired = ENV_EXEMPT_NAMES.filter(
      (name) => declared.includes(name) || !used.has(name),
    ).map((name) => ({
      file: 'test/architecture/allowlist.ts',
      line: 0,
      text: `${name} 已宣告或已不再使用`,
    }));

    expect(
      violationReport(
        expired,
        '以下 env 豁免已過期：請從 test/architecture/allowlist.ts 的 TEMPORARY_ENV 移除',
      ),
    ).toBe('');
  });
});
