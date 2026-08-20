import * as dotenv from 'dotenv';
// 必須在讀取 env 前先載入 .env：本檔案是整個程式最早被 import 的模組，
// 不能依賴 main.ts 的 dotenv.config()（import 提升會讓本檔的 Sentry.init 先執行）。
dotenv.config({ quiet: true });

import * as Sentry from '@sentry/nestjs';
import { getEnv } from './infrastructure/validate-env';

const env = getEnv();

// Sentry 需在任何其他模組載入前完成 init，才能正確 instrument。
// enabled 預設關閉；需同時開啟 flag 且提供 DSN 才會真正送出事件。
Sentry.init({
  dsn: env.SENTRY_DSN,
  enabled: env.APPLICATION_SENTRY_ENABLED && Boolean(env.SENTRY_DSN),
  environment: env.NODE_ENV,
  tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
});
