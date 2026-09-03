import {
  collectSourceFiles,
  findViolations,
  readSource,
  violationReport,
  type Violation,
} from './helpers';

/**
 * Hard Rule：e2e 對真實測試資料庫執行，不 mock 資料庫。
 *
 * mock 掉 Prisma 的 e2e 只是「測 mock 有沒有被呼叫」，抓不到 provider 建構子副作用、
 * env 空字串、adapter 即時計算欄位這類只有真 DI + 真 DB 才會浮現的問題。
 *
 * 除了禁止各 spec 覆寫，也禁止測試 helper **提供** mock 入口——留著入口等於官方
 * 認可的繞道，規則會形同虛設。
 */
describe('架構守則：e2e 對真實資料庫執行', () => {
  const specs = collectSourceFiles(['test'], {}).filter((f) =>
    f.endsWith('.e2e-spec.ts'),
  );

  it('掃描範圍有效', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it('e2e spec 一律放在 test/e2e/', () => {
    // jest.e2e.config.js 的 testRegex 是 `test/.*\.e2e-spec\.ts$`，放回平鋪一樣會被跑到，
    // 組織會靜默侵蝕回原狀。lifecycle 檔在 test/setup/、共用 helper 在 test/helpers/，
    // spec 只在 test/e2e/——三者分開才不會又混成一層。
    const misplaced = specs.filter((f) => !f.startsWith('test/e2e/'));

    expect(
      misplaced.length === 0
        ? ''
        : `以下 e2e spec 不在 test/e2e/：\n${misplaced
            .map((f) => `  ${f}`)
            .join(
              '\n',
            )}\ntest/ 的分工：e2e/ 放 spec、setup/ 放 jest lifecycle、helpers/ 放共用斷言與 fixture、architecture/ 放守則`,
    ).toBe('');
  });

  it('e2e 不得覆寫 PrismaService', () => {
    const offenders = findViolations(
      specs,
      /overrideProvider\(\s*PrismaService/,
    );

    expect(
      violationReport(
        offenders,
        'e2e 覆寫了 PrismaService：e2e 一律走真 test DB（庫名須含 test，globalSetup 有守門），mock 版看不到真實的 DI 與 DB 行為',
      ),
    ).toBe('');
  });

  it('setup/test-app.ts 不得提供 mock 資料庫的入口', () => {
    const source = readSource('test/setup/test-app.ts');
    const offenders: Violation[] = /^\s*prisma\?:/m.test(source)
      ? [
          {
            file: 'test/setup/test-app.ts',
            line:
              source.split('\n').findIndex((l) => /^\s*prisma\?:/.test(l)) + 1,
            text: 'TestAppOverrides 提供了 prisma override 欄位',
          },
        ]
      : [];

    expect(
      violationReport(
        offenders,
        'createE2EApp 的 overrides 提供了 mock 資料庫入口：請移除該欄位，否則「不得 mock DB」的規則形同虛設',
      ),
    ).toBe('');
  });

  /**
   * 測試環境的設定必須密封於開發者的 `.env`。
   *
   * 2026-09-03 踩過：`config({ path })` 把整份 `.env` 灌進 `process.env`，
   * 開發者的 `APPLICATION_SESSION_IDLE_ENABLED=true` 讓本機 e2e **183 個失敗**，
   * 訊息卻只說「Session 已因閒置過久而過期」。**CI 永遠是綠的**——
   * CI 沒有 `apps/api/.env`，dotenv 靜默 no-op。
   *
   * 差別在預設值：逐項指名的預設是密封，新增旗標不必改任何東西；
   * 載入全部的預設是洩漏，每新增一個旗標就多一條路徑，而沒有東西會提醒你。
   */
  describe('測試環境的設定必須密封', () => {
    const ENV_HELPER = 'test/helpers/e2e-env.ts';

    it('掃描範圍有效', () => {
      const source = readSource(ENV_HELPER);
      expect(source.length).toBeGreaterThan(0);
      // 讀不到 dotenv 的呼叫代表解析對象變了，下面的規則會空轉成綠
      expect(/\bconfig\s*\(/.test(source)).toBe(true);
    });

    it('⭐ dotenv 的解析結果不得直接進 process.env', () => {
      const source = readSource(ENV_HELPER);
      // config() 必須帶 processEnv，把解析結果導向暫存物件；
      // 少了它就是「整份載入」，而那是預設洩漏
      const callsConfig = /\bconfig\s*\(/.test(source);
      const sealed = /processEnv\s*:/.test(source);

      expect(
        callsConfig && !sealed
          ? `${ENV_HELPER} 呼叫 dotenv 的 config() 但沒有帶 processEnv：\n` +
              `解析結果會整份寫進 process.env，開發者的功能開關就會影響測試結果，\n` +
              `而 CI 沒有 apps/api/.env，那一側永遠是綠的——缺陷不會被 CI 發現。\n` +
              `請用 config({ processEnv: <暫存物件> }) 並只複製需要的鍵。`
          : '',
      ).toBe('');
    });

    it('只有資料庫連線變數可以從 .env 取得', () => {
      const source = readSource(ENV_HELPER);
      const copied = [...source.matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map(
        (m) => m[1],
      );
      const nonDb = copied.filter((name) => !name.startsWith('DB_'));

      expect(
        nonDb.length === 0
          ? ''
          : `${ENV_HELPER} 從 .env 取用了非資料庫變數：\n${nonDb
              .map((name) => `  ${name}`)
              .join(
                '\n',
              )}\n測試要驗的是程式碼，不是某台機器的設定組合——請改寫在 test/setup/setup-env.e2e.ts`,
      ).toBe('');
    });
  });
});
