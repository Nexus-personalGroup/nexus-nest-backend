/**
 * 整合測試 setupFiles
 *
 * 與 e2e 的關鍵差別：**不 mock Redis**。跨實例廣播完全建立在 Redis pub/sub 之上，
 * mock 掉等於把要驗證的東西拿掉——那正是前一版專案「單機測試全過、
 * 多實例才發現訊息消失」的成因。
 *
 * ## 外部相依
 *
 * 這支測試需要**兩個真實服務**：
 *
 * - **PostgreSQL**：連線帳密由 `applyE2EDbEnv()` 從 `.env` 載入，資料庫指向 `DB_TEST_DATABASE`
 * - **Redis**：跨實例廣播的載體，**不可 mock**
 *
 * 本機用 `pnpm docker:deps` 起的兩個容器，CI 用 service container。
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { applyE2EDbEnv } from '../helpers/e2e-env';

applyE2EDbEnv();

// Redis 連線**明確宣告**，不依賴 envSchema 的預設值。
//
// 原本這裡沒設，本機靠 `.env` 的 6389、CI 沒有 `.env` 就落到 envSchema 預設的
// `localhost:6379`——剛好等於 service container 的埠。能動，但那是兩個毫無關聯的
// 決定湊巧一致：改 envSchema 的預設或 compose 的埠，它就會以「連不到 Redis」的形式
// 失敗，而症狀指不到原因。
//
// 預設值取 CI 的 service container；本機由 `.env` 或 shell 覆寫。
process.env.REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT ?? '6379';
process.env.REDIS_KEY_PREFIX = 'integration:';

process.env.NODE_ENV = 'test';
process.env.ACCESS_SECRET = 'integration-access-secret-min-32-chars';
process.env.REFRESH_SECRET = 'integration-refresh-secret-min-32-char';
process.env.COOKIE_SECRET = 'integration-cookie-secret-32-chars!!';
process.env.BCRYPT_ROUNDS = '1';
process.env.APP_TIMEZONE = 'Asia/Taipei';
process.env.AWS_MEDIA_LIBRARY_ROOT = 'local';
process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_MEDIA_ROOT = join(tmpdir(), 'nexus-media-integration');
process.env.WEB_STATIC_ROOT = join(tmpdir(), 'nexus-web-dist-integration');

// 排程在整合測試中只會製造 open handle 與非預期的資料異動
process.env.LOG_PURGE_ENABLED = 'false';
// 限流閾值調低（預設 20 要送 21 次才觸發，測試會慢且像在做壓力測試），
// 但**必須高於任何單一測試中「同一成員在同一房間」的最大連發數**——
// 併發序號測試會由同一人連送 5 則，閾值設 3 時它會以
// 「ack 沒回來」的形式失敗，而症狀完全指不到限流。
// 視窗放長是為了避免慢機器上視窗先滑掉而讓限流測試偶發通過
process.env.WS_MESSAGE_RATE_LIMIT = '10';
process.env.WS_MESSAGE_RATE_WINDOW_SEC = '60';
process.env.SCHEDULE_ENABLED = 'false';

// 連線層限流的閾值。**必須高於任何其他測試中單一連線的最大連發數**——
// 目前的上限是限流測試的 11 次送訊息加上 join，約 13 個事件。
// 設得太低會讓那些測試以「事件憑空消失」的形式失敗，而症狀完全指不到這裡：
// 業務層限流回的是 CHAT_MESSAGE_RATE_LIMITED，連線層回的是 WS_RATE_LIMITED，
// 兩個都走同一個 error 事件。
process.env.WS_CONNECTION_EVENT_LIMIT = '30';
process.env.WS_CONNECTION_EVENT_WINDOW_SEC = '1';

// 心跳壓到 1 秒、陳舊門檻 2 秒：實例死亡的情境用預設值要等 45 秒才驗得到，
// 那會讓這支測試慢到沒人願意跑。行為與正式設定完全相同，只是時間尺度不同
process.env.WS_HEARTBEAT_INTERVAL = '1';
process.env.WS_STALE_MULTIPLIER = '2';
process.env.WS_OFFLINE_BROADCAST_DELAY = '0';
