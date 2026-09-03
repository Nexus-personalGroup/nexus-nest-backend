import { config } from 'dotenv';
import { resolve } from 'path';

/**
 * 允許從開發者的 `.env` 進入測試行程的鍵——其餘一律丟棄。
 *
 * 預設密封而非預設洩漏：新增功能開關時不需要動這份清單，
 * 而「載入全部再蓋掉幾個」的做法每新增一個旗標就多一條洩漏路徑。
 */
const DB_KEYS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
  'DB_TEST_DATABASE',
] as const;

/**
 * e2e 專用 DB 環境：從 `apps/api/.env` **只取資料庫連線變數**，
 * 並強制把 `DB_DATABASE` 指向測試庫（`DB_TEST_DATABASE`）。
 *
 * 只取 `DB_*` 是刻意的：整份載入會讓開發者的功能開關進到測試行程，
 * 使同一份程式碼在不同機器上得到不同結果——而 CI 沒有 `.env`，
 * 那一側**永遠是綠的**，缺陷因此不會被 CI 發現。
 *
 * 呼叫端已設定的環境變數優先：`verify:ci` 靠這個把資料庫指向拋棄式的
 * tmpfs 實例。順序反了會靜默連到開發庫——下面的守門只檢查名稱含 "test"，
 * 不檢查是哪一台主機。
 *
 * globalSetup 與 setupFiles 皆先呼叫此函式（兩者為不同 process，各自需套用）。
 */
export const applyE2EDbEnv = (): void => {
  // processEnv 指向暫存物件，解析結果不會碰到 process.env
  const parsed: Record<string, string> = {};
  // 本檔位於 apps/api/test/helpers → 往上兩層取 apps/api/.env
  config({
    path: resolve(__dirname, '..', '..', '.env'),
    processEnv: parsed,
    quiet: true,
  });

  for (const key of DB_KEYS) {
    const fromFile = parsed[key];
    if (process.env[key] === undefined && fromFile !== undefined) {
      process.env[key] = fromFile;
    }
  }

  const testDb = process.env.DB_TEST_DATABASE;
  if (!testDb || !/test/i.test(testDb)) {
    throw new Error(
      `e2e 需在 .env 設 DB_TEST_DATABASE，且名稱須含 "test"（防誤連 dev / prod）。目前：${testDb ?? '(未設)'}`,
    );
  }
  // 覆寫連線目標為測試庫（上面的複製不覆寫既有值，故此處顯式指定）
  process.env.DB_DATABASE = testDb;
};
