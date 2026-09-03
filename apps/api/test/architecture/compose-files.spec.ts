import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { API_ROOT, readSource } from './helpers';
import { COMPOSE_UNPINNED_CONNECTION_VARS } from './allowlist';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');

const read = (relative: string): string =>
  readFileSync(join(REPO_ROOT, relative), 'utf8');

/**
 * 遞迴列出目錄下的所有檔案（相對 REPO_ROOT）。
 *
 * `docker/` 底下一度只有檔案，於是原本直接 `readdirSync().map()`——
 * 加入 `docker/nginx/` 之後那個假設就壞了，`readFileSync` 對目錄丟 EISDIR。
 * 掃描清單的規則要能承受「有人在裡面開子目錄」，否則它會在**別人加東西的那一刻**
 * 壞掉，而錯誤訊息（EISDIR）完全指不到原因。
 */
const filesUnder = (relativeDir: string): string[] => {
  const absolute = join(REPO_ROOT, relativeDir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(`${relativeDir}/${entry.name}`)
      : [`${relativeDir}/${entry.name}`],
  );
};

const composeFiles = (): string[] =>
  readdirSync(REPO_ROOT)
    .filter((f) => /^compose(\..+)?\.ya?ml$/.test(f))
    .sort();

/**
 * 取出 `services:` 底下某個服務的區塊（不含服務名那行）。
 *
 * 終止條件只認「下一個服務鍵」（`  name:`）與頂層鍵，**不認註解**——
 * 服務之間的說明註解同樣縮排兩格，拿它當邊界的話，區塊會在註解處被截斷，
 * 截斷之後漏掉的宣告是**靜默通過**，不是報錯。
 */
const serviceBlock = (body: string, name: string): string | null => {
  const lines = body.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}[\w-]+:/.test(l) || /^\S/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
};

/** 服務區塊裡有沒有 `ports:` 宣告（服務屬性縮排四格） */
const declaresPorts = (block: string): boolean => /^ {4}ports:/m.test(block);

/** 取出 `- '127.0.0.1:3316:3306'` 這類對外埠宣告中的主機埠 */
const publishedPorts = (body: string): string[] => [
  ...new Set(
    [
      ...body.matchAll(/['"](?:[\d.]+:)?(?:\$\{\w+:-)?(\d{2,5})\}?:\d+['"]/g),
    ].map((m) => m[1]),
  ),
];

/**
 * compose 檔的執行路徑與文件同步。
 *
 * 這兩件事沒有任何工具會提醒：compose 檔可以沒有任何指令會啟動它（就是本專案反覆
 * 出現的「設定寫了但沒有執行路徑」），而對外埠改了之後 README 照樣寫著舊埠——
 * 照文件設 `.env` 的人會連不上，而且錯誤訊息完全指不到原因。
 */
describe('架構守則：compose 檔的執行路徑與埠號文件', () => {
  const files = composeFiles();
  const rootScripts: Record<string, string> = (() => {
    const pkg: unknown = JSON.parse(read('package.json'));
    if (typeof pkg !== 'object' || pkg === null || !('scripts' in pkg))
      return {};
    const scripts = pkg.scripts;
    return typeof scripts === 'object' && scripts !== null
      ? (scripts as Record<string, string>)
      : {};
  })();

  it('掃描範圍有效', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(Object.keys(rootScripts).length).toBeGreaterThan(0);
  });

  it('docker 相關檔案提到的 pnpm script 都必須存在', () => {
    // 檔案或指令改名後，註解裡的指引不會有任何工具提醒。實際發生過：
    // 三份 compose 併成一份後，docker/api.container.env 仍寫著 `compose.app.yml`
    // 與 `pnpm app:up`，兩個可操作的指引都指向不存在的東西。
    const targets = [
      ...files,
      'Dockerfile',
      '.dockerignore',
      ...filesUnder('docker'),
    ].filter((f) => existsSync(join(REPO_ROOT, f)));

    const broken: string[] = [];
    let referenced = 0;

    for (const file of targets) {
      // 只認含冒號的 script 名（docker:up / verify:ci / db:migrate…）——
      // 那涵蓋了所有會被改名的 docker 相關指令，而散文裡的「.pnpm store」
      // 「pnpm 11 需要」不含冒號，不會誤判。代價是漏掉 `pnpm dev` 這類單字名，
      // 但那幾支是慣例名稱、幾乎不會改。
      for (const match of read(file).matchAll(/pnpm ([a-z][\w-]*:[\w:-]+)/g)) {
        const script = match[1];
        referenced += 1;
        if (!(script in rootScripts)) broken.push(`  ${file}: pnpm ${script}`);
      }
    }

    // 完全沒引用代表正規式或掃描清單失效，這條規則會空轉
    expect(referenced).toBeGreaterThan(0);

    expect(
      broken.length === 0
        ? ''
        : `以下 docker 相關檔案提到不存在的 pnpm script：\n${broken.join(
            '\n',
          )}\n照著做的人會找不到指令。改 script 名稱時記得一併搜尋 compose / Dockerfile / docker/ 的註解`,
    ).toBe('');
  });

  it('每份 compose 都要有指令會啟動它', () => {
    const allScripts = Object.values(rootScripts).join('\n');
    const shellScripts = existsSync(join(REPO_ROOT, 'scripts'))
      ? readdirSync(join(REPO_ROOT, 'scripts'))
          .filter((f) => f.endsWith('.sh'))
          .map((f) => read(`scripts/${f}`))
          .join('\n')
      : '';

    const orphans = files.filter(
      (f) => !allScripts.includes(f) && !shellScripts.includes(f),
    );

    expect(
      orphans.length === 0
        ? ''
        : `以下 compose 檔沒有任何 script 會啟動，等於死檔：\n${orphans
            .map((f) => `  ${f}`)
            .join('\n')}\n請在 root package.json 加對應 script，或刪除該檔`,
    ).toBe('');
  });

  it('compose.yml 的對外埠必須寫進 README', () => {
    const devCompose = 'compose.yml';
    if (!files.includes(devCompose)) return;

    const ports = publishedPorts(read(devCompose));
    // 正規式失效時這條規則會空轉
    expect(ports.length).toBeGreaterThan(0);

    const readme = read('README.md');
    const undocumented = ports.filter((p) => !readme.includes(p));

    expect(
      undocumented.length === 0
        ? ''
        : `compose.yml 的對外埠未寫進 README：\n${undocumented
            .map((p) => `  ${p}`)
            .join('\n')}\n照 README 設 .env 的人會連不上，且錯誤訊息指不到原因`,
    ).toBe('');
  });

  /**
   * 容器模式的入口只有反向代理。
   *
   * 這條防的不是「有人不同意單一入口」，是**「為了 debug 暫時開一下然後忘了拿掉」**
   * ——那個回歸沒有任何症狀，只會讓下一次驗 CORS 或 cookie 的人得到錯的結論。
   *
   * 用服務名稱表述而非「只有 nginx 可以有 ports」的白名單：白名單會在有人加新服務時
   * 誤報，而誤報的處理方式是把服務加進白名單，規則從此空轉。
   */
  it('api 與 web 不得宣告對外埠——容器模式的入口只有代理', () => {
    const body = read('compose.yml');
    const blocks = Object.fromEntries(
      ['api', 'web', 'nginx'].map((n) => [n, serviceBlock(body, n)]),
    );

    // 掃不到服務就等於規則不存在，服務改名時要在這裡失敗而不是靜默通過
    for (const [name, block] of Object.entries(blocks)) {
      expect(block === null ? `compose.yml 找不到服務 ${name}` : '').toBe('');
    }

    // nginx 是正對照組：它一定有 ports。這裡若為 false 代表解析或正規式失效，
    // 而失效的表現正好是「api / web 也都看起來沒有 ports」——規則空轉
    expect(declaresPorts(blocks.nginx ?? '')).toBe(true);

    const offenders = ['api', 'web'].filter((n) =>
      declaresPorts(blocks[n] ?? ''),
    );

    expect(
      offenders.length === 0
        ? ''
        : `以下服務宣告了對外埠：${offenders.join(
            ' / ',
          )}\n容器模式的入口只有 nginx（${'${APP_PROXY_PORT:-8080}'}）——多一條直連的路，` +
            `\n「單一 origin」就變成可選的，而代理設定漂掉時沒有人會發現。` +
            `\n要直連 api / web 請改跑 host 模式：pnpm docker:deps + pnpm dev（3000 / 5173）。` +
            `\n只是想確認代理有沒有壞：docker compose exec nginx wget -qO- http://api:3000/api/health`,
    ).toBe('');
  });
});

/**
 * 連線類環境變數必須在 compose 釘死。
 *
 * 容器以 `env_file` 讀入開發者本機的 `apps/api/.env`——compose 的 `environment`
 * 優先序最高，所以**釘死就是保護**；反過來說，**沒釘死的連線類變數會直接採用
 * host 的值**，而那個值多半指向 `localhost`，在容器裡連不到。
 *
 * 這條要在**新增變數的當下**失敗，而不是等有人遇到：症狀全是靜默的
 * ——Redis 連不上會降級運行、SMTP 要到真的寄信才失敗、信件連結錯了不會失敗。
 *
 * **只檢查「有沒有釘」，不檢查「值對不對」**：後者需要知道每個變數的語意。
 * 值由實機驗收負責，這裡負責的是「新增時有沒有人想過它在容器裡該是什麼」。
 */
describe('架構守則：連線類環境變數必須在 compose 釘死', () => {
  const CONNECTION_SUFFIX = /(_HOST|_PORT|_URL)$/;

  /** envSchema 宣告的所有變數名 */
  const declaredEnvVars = (): string[] => {
    const src = readSource('src/infrastructure/validate-env.ts');
    const body = src.slice(src.indexOf('envSchema'));
    return [...body.matchAll(/^ {2}([A-Z][A-Z0-9_]*):\s/gm)].map((m) => m[1]);
  };

  /** compose.yml 的 api 服務 `environment:` 底下宣告的變數名 */
  const composePinned = (): string[] => {
    const body = read('compose.yml');
    const service = body.slice(body.indexOf('  api:'), body.indexOf('  web:'));
    const start = service.indexOf('    environment:');
    const end = service.indexOf('    depends_on:');
    if (start === -1 || end === -1) return [];
    return [
      ...service.slice(start, end).matchAll(/^ {6}([A-Z][A-Z0-9_]*):/gm),
    ].map((m) => m[1]);
  };

  it('掃描範圍有效', () => {
    // 任一邊掃不到就代表結構變了，規則會空轉成「全部都釘了」
    expect(declaredEnvVars().length).toBeGreaterThan(0);
    expect(composePinned().length).toBeGreaterThan(0);
    expect(
      declaredEnvVars().filter((v) => CONNECTION_SUFFIX.test(v)).length,
    ).toBeGreaterThan(0);
  });

  it('每個連線類變數都必須釘死或列入豁免', () => {
    const pinned = new Set(composePinned());
    const exempt = new Map(
      COMPOSE_UNPINNED_CONNECTION_VARS.map((e) => [e.name, e.reason]),
    );

    const unpinned = declaredEnvVars()
      .filter((v) => CONNECTION_SUFFIX.test(v))
      .filter((v) => !pinned.has(v) && !exempt.has(v));

    expect(
      unpinned.length === 0
        ? ''
        : `以下連線類變數沒有在 compose 的 api environment 釘死：\n${unpinned
            .map((v) => `  ${v}`)
            .join('\n')}\n` +
            `容器會以 env_file 讀入開發者本機的 apps/api/.env，沒釘死就直接採用 host 的值` +
            `\n——而那個值多半指向 localhost，在容器裡連不到，且症狀是靜默的。` +
            `\n釘進 compose.yml，或加進 allowlist 的 COMPOSE_UNPINNED_CONNECTION_VARS 並寫理由`,
    ).toBe('');
  });

  it('豁免清單不得有過期項目', () => {
    const declared = new Set(declaredEnvVars());
    const stale = COMPOSE_UNPINNED_CONNECTION_VARS.filter(
      (e) => !declared.has(e.name),
    ).map((e) => e.name);

    expect(
      stale.length === 0
        ? ''
        : `以下豁免項目在 envSchema 已不存在：\n${stale
            .map((v) => `  ${v}`)
            .join('\n')}\n變數移除後遺留的死字串，請一併刪除`,
    ).toBe('');
  });

  /** x-app-base 錨點到 services: 之間的共用區塊；結構變了回 null 而非空字串 */
  const sharedBaseBlock = (): string | null => {
    const body = read('compose.yml');
    // 行首錨定：`services:` 這串字在檔頭的用法說明裡也出現得到
    const start = body.search(/^x-app-base:/m);
    const end = body.search(/^services:/m);
    if (start === -1 || end === -1 || end <= start) return null;
    return body.slice(start, end);
  };

  it('共用區塊的掃描範圍有效', () => {
    // 回 null 代表 compose 結構變了，下一條規則會空轉成「沒有 env_file」
    expect(sharedBaseBlock()).not.toBeNull();
    expect(sharedBaseBlock()?.length ?? 0).toBeGreaterThan(0);
  });

  it('env_file 只能掛在 api 服務，不得放進共用的 x-app-base', () => {
    const shared = sharedBaseBlock() ?? '';

    expect(
      /^ {2}env_file:/m.test(shared)
        ? 'env_file 出現在 x-app-base：這會讓 e2e 服務也讀進開發者本機的 apps/api/.env，' +
            '\n而那條路徑的目的正是密封（與 CI 同形、不受本機設定影響）。' +
            '\n開發者的環境檔只該進 api 服務——把 env_file 移回 api: 底下。'
        : '',
    ).toBe('');
  });
});
