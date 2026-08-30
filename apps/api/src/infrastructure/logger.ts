import pino from 'pino';

// 直讀 process.env 而非 getEnv()，是**刻意的**：這支 logger 在 App 建立之前就要能用，
// 而 `validate-env` 驗證失敗時要靠它把錯誤印出來——改成 getEnv() 會形成
// 「驗證失敗 → 想印錯誤 → 需要 logger → logger 要先跑驗證」的循環。
// 這是全 codebase 唯一豁免「新 env 一律進 envSchema」那條 Hard Rule 的地方。
const isDev = process.env.NODE_ENV !== 'production';

/**
 * App 啟動階段（NestJS 尚未建立）使用的 Pino logger。
 *
 * App 建立後改用 `nestjs-pino` 的 `Logger`（見 `main.ts` 的 `app.useLogger`）。
 */
export const log = pino({
  name: process.env.SERVICE_NAME || 'nexus-api',
  level: process.env.LOG_LEVEL || 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss' },
    },
  }),
});
