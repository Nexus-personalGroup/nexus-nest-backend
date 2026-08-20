import { config } from 'dotenv';
import { resolve } from 'path';

/**
 * e2e 專用 DB 環境:載入真 `.env` 的連線帳密，並強制把 `DB_DATABASE` 指向測試庫
 * (`DB_TEST_DATABASE`)。
 *
 * 守門:測試庫名稱須含 "test"，否則中止——絕不誤連 / 誤清 dev / prod 庫。
 * globalSetup 與 setupFiles 皆先呼叫此函式（兩者為不同 process，各自需套用）。
 */
export const applyE2EDbEnv = (): void => {
  // 本檔位於 apps/api/test/helpers → 往上兩層取 apps/api/.env
  config({ path: resolve(__dirname, '..', '..', '.env'), quiet: true });

  const testDb = process.env.DB_TEST_DATABASE;
  if (!testDb || !/test/i.test(testDb)) {
    throw new Error(
      `e2e 需在 .env 設 DB_TEST_DATABASE，且名稱須含 "test"（防誤連 dev / prod）。目前：${testDb ?? '(未設)'}`,
    );
  }
  // 覆寫連線目標為測試庫（dotenv 不覆寫既有值，故此處顯式指定）
  process.env.DB_DATABASE = testDb;
};
