import { PUBLIC_MOUNT_EXEMPTIONS } from './allowlist';
import { readSource } from './helpers';
import { stripComments } from './ws-source';
import { INFRA_EXEMPT_PATHS } from '@app/adapter/in/web/guard/infra-endpoint';

const GUARD = 'src/adapter/in/web/guard/JwtAuthGuard.ts';
const INFRA = 'src/adapter/in/web/guard/infra-endpoint.ts';
const MAIN = 'src/main.ts';

/**
 * 會做路徑豁免的檔案。
 *
 * ⚠️ **搬移邏輯時要一起更新這份清單**：判斷從 `JwtAuthGuard` 搬到
 * `infra-endpoint` 時，只掃原檔的規則會照樣綠——它守的東西已經不在那裡了。
 */
const PATH_EXEMPTION_SOURCES = [GUARD, INFRA];

/** IP 黑白名單 Guard——它們的豁免依據不得是 `@Public()` */
const IP_GUARDS = [
  'src/adapter/in/web/guard/IpWhitelistGuard.ts',
  'src/adapter/in/web/guard/IpBlacklistGuard.ts',
];

/**
 * `JwtAuthGuard` 內以前綴比對做的路徑豁免。
 *
 * 前綴比對的性質是「未來新增的任何同前綴路徑自動免認證」，
 * 而那不會有任何錯誤訊息提醒你——它是一條**會自己長大的豁免**。
 */
export const prefixExemptions = (source: string): string[] => {
  const clean = stripComments(source);
  return [
    ...clean.matchAll(/\b(?:url|path)\b[^\n]*?\.startsWith\(\s*'([^']+)'/g),
  ].map((match) => match[1]);
};

/**
 * `app.use()` 掛載的路徑（第一個參數看起來是路徑的那些）。
 *
 * 只抓「有路徑參數」的形式：`app.use(middleware)` 是全域中介層，不是掛載。
 * 路徑可能是字串、樣板字串或變數——一律以**原始程式文字**當鍵，
 * 因為樣板字串裡的變數靜態解析不出來，而規則要抓的是「多了一個掛載」這件事。
 */
export const mountedPaths = (source: string): string[] => {
  const clean = stripComments(source);
  return [
    ...clean.matchAll(/app\.use\(\s*(`[^`]+`|'[^']+'|env\.[A-Z_]+)\s*,/g),
  ].map((match) => match[1]);
};

/**
 * 未認證可達的表面必須明示。
 *
 * 本專案已發生過兩次同一種形狀：`/api/metrics` 用 `startsWith` 豁免
 * （未來任何同前綴路由自動免認證），以及 Swagger 用 `app.use()` 掛載
 * （**完全不經過 Nest 的 guard**——掛載處看起來只是「提供文件」，
 * guard 那邊看起來「所有路由都保護了」，兩邊各自都對）。
 *
 * `@Public()` 是明示的表態，不在本規則範圍——它已被 `authorization-coverage` 涵蓋。
 */
describe('架構守則：未認證可達的表面', () => {
  it('掃描範圍有效', () => {
    // 掃到 0 個掛載代表解析失效（例如 main.ts 改寫），規則會就此空轉
    expect(mountedPaths(readSource(MAIN)).length).toBeGreaterThan(0);
  });

  it('路徑豁免不得以前綴比對', () => {
    const offenders = PATH_EXEMPTION_SOURCES.flatMap((file) =>
      prefixExemptions(readSource(file)).map((path) => `${file} → ${path}`),
    );

    expect(
      offenders.length === 0
        ? ''
        : `以下檔案用前綴比對做路徑豁免：\n${offenders
            .map((entry) => `  ${entry}`)
            .join(
              '\n',
            )}\n前綴豁免會讓「未來新增的任何同前綴路由」自動豁免，而那不會有任何錯誤訊息提醒你。\n請改用精確比對（記得先去掉 query string）。`,
    ).toBe('');
  });

  describe('基礎設施探針的豁免', () => {
    it('掃描範圍有效', () => {
      // 清單空掉的話「每筆都有理由」會空轉成綠
      expect(INFRA_EXEMPT_PATHS.length).toBeGreaterThan(0);
      expect(IP_GUARDS.every((file) => readSource(file).length > 0)).toBe(true);
    });

    it('每筆路徑豁免都必須註明理由', () => {
      const noReason = INFRA_EXEMPT_PATHS.filter(
        (item) => item.reason.trim().length === 0,
      ).map((item) => `  ${item.path}`);

      expect(
        noReason.length === 0
          ? ''
          : `以下豁免沒有理由：\n${noReason.join(
              '\n',
            )}\n豁免一旦失去理由就會逐漸長大`,
      ).toBe('');
    });

    it('豁免路徑必須仍存在於程式碼中（過期項目要紅）', () => {
      // 路徑在 src 其他地方被引用 = 該端點還存在。端點移除後這裡會紅，
      // 避免留下指向不存在路由的死字串
      const sources = ['src/app.module.ts', 'src/main.ts']
        .map((file) => readSource(file))
        .join('\n');
      const stale = INFRA_EXEMPT_PATHS.filter(
        (item) => !sources.includes(item.path),
      ).map((item) => `  ${item.path}`);

      expect(
        stale.length === 0
          ? ''
          : `以下豁免路徑在應用程式中已找不到：\n${stale.join(
              '\n',
            )}\n端點移除後遺留的死字串，請一併刪除`,
      ).toBe('');
    });

    it('⭐ IP 黑白名單 Guard 不得以 @Public() 作為豁免依據', () => {
      const offenders = IP_GUARDS.filter((file) =>
        /IS_PUBLIC_KEY|public\.decorator/.test(stripComments(readSource(file))),
      );

      expect(
        offenders.length === 0
          ? ''
          : `以下 Guard 引用了 @Public() 的 metadata：\n${offenders
              .map((file) => `  ${file}`)
              .join(
                '\n',
              )}\n登入 / 註冊端點也是 @Public()，而擋惡意來源打登入正是 IP 黑名單存在的主要理由。\n` +
              `用 @Public() 當判準等於讓黑名單對登入失效——那是用一個安全缺陷換掉一個可用性缺陷。\n` +
              `豁免的判準必須是「這是不是基礎設施探針」（@InfraEndpoint()），不是「需不需要認證」。`,
      ).toBe('');
    });
  });

  it('app.use() 掛載的路徑必須列入豁免清單', () => {
    const allowed = new Set(PUBLIC_MOUNT_EXEMPTIONS.map((item) => item.path));
    const missing = mountedPaths(readSource(MAIN)).filter(
      (path) => !allowed.has(path),
    );

    expect(
      missing.length === 0
        ? ''
        : `以下 app.use() 掛載的路徑不在豁免清單中：\n${missing
            .map((path) => `  ${path}`)
            .join(
              '\n',
            )}\napp.use() 掛的是原生 Express middleware，**完全不經過 Nest 的 guard**。\n請列入 test/architecture/allowlist.ts 的 PUBLIC_MOUNT_EXEMPTIONS 並註明理由。`,
    ).toBe('');
  });

  it('每筆掛載豁免都必須註明理由', () => {
    const noReason = PUBLIC_MOUNT_EXEMPTIONS.filter(
      (item) => item.reason.trim().length === 0,
    ).map((item) => `  ${item.path}`);

    expect(
      noReason.length === 0
        ? ''
        : `以下豁免沒有理由：\n${noReason.join(
            '\n',
          )}\n豁免一旦失去理由就會逐漸長大`,
    ).toBe('');
  });

  /**
   * 守則自身的測試。
   *
   * 給出偽陰性的守則比沒有守則更危險：它會讓人停止人工檢查，而且不會有任何徵兆。
   */
  describe('判定邏輯（合成輸入）', () => {
    it('A：startsWith 豁免 → 抓出', () => {
      const src = `if (url.startsWith('/api/metrics')) return true;`;
      expect(prefixExemptions(src)).toEqual(['/api/metrics']);
    });

    it('B：精確比對 → 通過', () => {
      const src = `if (url.split('?')[0] === '/api/metrics') return true;`;
      expect(prefixExemptions(src)).toEqual([]);
    });

    it('C：只有註解提到 startsWith → 不算違規', () => {
      const src = `// 原本是 url.startsWith('/api/metrics')\nif (url === '/api/metrics') return true;`;
      expect(prefixExemptions(src)).toEqual([]);
    });

    it('D：字串路徑的掛載 → 抓得到', () => {
      const src = `app.use('/media', express.static(root));`;
      expect(mountedPaths(src)).toEqual(["'/media'"]);
    });

    it('E：樣板字串的掛載 → 抓得到', () => {
      const src = 'app.use(`${basePath}/docs`, swaggerUi.setup(doc));';
      expect(mountedPaths(src)).toEqual(['`${basePath}/docs`']);
    });

    it('F：沒有路徑參數的全域中介層 → 不列入', () => {
      const src = `app.use(helmet());\napp.use(cookieParser(secret));`;
      expect(mountedPaths(src)).toEqual([]);
    });
  });
});
