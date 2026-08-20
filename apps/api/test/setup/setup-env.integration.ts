/**
 * 整合測試 setupFiles
 *
 * 與 e2e 的關鍵差別：**不 mock Redis**。跨實例廣播完全建立在 Redis pub/sub 之上，
 * mock 掉等於把要驗證的東西拿掉——那正是前一版專案「單機測試全過、
 * 多實例才發現訊息消失」的成因。
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { applyE2EDbEnv } from '../helpers/e2e-env';

applyE2EDbEnv();

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
process.env.SCHEDULE_ENABLED = 'false';

// 心跳壓到 1 秒、陳舊門檻 2 秒：實例死亡的情境用預設值要等 45 秒才驗得到，
// 那會讓這支測試慢到沒人願意跑。行為與正式設定完全相同，只是時間尺度不同
process.env.WS_HEARTBEAT_INTERVAL = '1';
process.env.WS_STALE_MULTIPLIER = '2';
process.env.WS_OFFLINE_BROADCAST_DELAY = '0';
