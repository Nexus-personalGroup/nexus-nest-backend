/**
 * E2E setupFiles（每個 test 檔載入前跑）:
 * 先套 e2e DB 環境（真 `.env` 的 DB 連線 + 測試庫），再補其餘測試 env 讓 getEnv() 通過驗證。
 * DB 連線帳密由 applyE2EDbEnv 從真 `.env` 取得，此處刻意不設 DB_HOST / USER / PASSWORD。
 *
 * **除了 `DB_*` 之外，開發者的 `.env` 不會進到測試行程**（見 applyE2EDbEnv）。
 * 因此測試要用的設定一律寫在本檔——寫在自己的 `.env` 不會生效，
 * 這是刻意的：測試要驗的是程式碼，不是某台機器的設定組合。
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { applyE2EDbEnv } from '../helpers/e2e-env';

applyE2EDbEnv();

process.env.NODE_ENV = 'test';
process.env.ACCESS_SECRET = 'e2e-test-access-secret-min-32-chars!!'; // min(32)
process.env.REFRESH_SECRET = 'e2e-test-refresh-secret-min-32-chars!'; // min(32)
process.env.COOKIE_SECRET = 'e2e-test-cookie-secret-32-chars!!';
process.env.BCRYPT_ROUNDS = '1'; // 測試用最低 cost factor，加速
process.env.APP_TIMEZONE = 'Asia/Taipei';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_KEY_PREFIX = 'test:';
process.env.PERMISSION_CACHE_TTL = '300';
process.env.DEFAULT_PAGE_LIMIT = '15';
process.env.NOTIFICATION_ALARM_HOUR = '8';
process.env.NOTIFICATION_ALARM_MINUTE = '0';
process.env.AWS_MEDIA_LIBRARY_ROOT = 'local';
// 單一埠 serve-static e2e 的前端 dist fixture 目錄（spec 自行建立 index.html）
process.env.WEB_STATIC_ROOT = join(tmpdir(), 'nexus-web-dist-e2e');
// 附件上傳 e2e：local driver 落地目錄指到 tmp，避免寫檔汙染專案
process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_MEDIA_ROOT = join(tmpdir(), 'nexus-media-e2e');
// 日誌保留排程預設啟用，測試環境關掉：cron job 會留下 open handle，
// 且 e2e 的 beforeEach 本來就會 resetDb，不需要也不該讓排程去動測試資料
process.env.LOG_PURGE_ENABLED = 'false';
// 指標在 e2e 開啟：/api/metrics 的內容是本次要驗的東西之一。
// 稽核維持預設（開啟），關閉的情境由單一測試自行覆寫
process.env.APPLICATION_METRICS_ENABLED = 'true';
