import { z } from 'zod';
import { log } from './logger';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default('info'),
  SERVICE_NAME: z.string().default('nexus-api'),
  API_BASE_URL: z.string().optional(),

  // 單一埠部署：前端打包產物根目錄；未設則相對 api 編譯輸出往上找 apps/web/dist
  WEB_STATIC_ROOT: z.string().optional(),

  // Database（必填）
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(3306),
  DB_USERNAME: z.string(),
  DB_PASSWORD: z.string().default(''),
  DB_DATABASE: z.string(),
  // e2e 專用測試庫名稱（僅 e2e 需要，dev / prod 可不設）；名稱須含 "test" 以防誤連 dev
  DB_TEST_DATABASE: z.string().optional(),

  // JWT（必填）
  ACCESS_SECRET: z.string().min(32),
  //預設 2 小時
  ACCESS_TOKEN_EXPIRES_IN: z.coerce.number().default(7200),
  REFRESH_SECRET: z.string().min(32),
  //預設 7 天
  REFRESH_TOKEN_EXPIRES_IN: z.coerce.number().default(604800),
  // JWT issuer/audience：簽發與驗證一致，避免 token 被共用同 secret 的其他服務重放
  JWT_ISSUER: z.string().default('hexagonal-api'),
  JWT_AUDIENCE: z.string().default('hexagonal-web'),
  SESSION_SECRET: z
    .string()
    .min(32)
    .or(z.literal(''))
    .optional()
    .transform((v) => (v === '' ? undefined : v)),

  // Redis（**必要相依**）：token 黑名單採 fail-closed——無法查詢就無法確認 token
  // 是否已被撤銷，因此一律回 503。連線參數有預設值只是為了本機方便，
  // 不代表服務可以沒有 Redis。
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_KEY_PREFIX: z.string().default('nest:'),
  REDIS_TTL: z.coerce.number().default(0),
  REDIS_URL: z.string().optional(),

  // CORS / Cookie
  // 預設 dev 兩個 origin。**不要設為 `*`**：CORS 規範下 origin=`*` 與 credentials: true
  // 互斥，瀏覽器會 silent reject credentialed 請求（production 段也擋 `*`）
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000,http://localhost:5173'),
  COOKIE_SECRET: z.string().min(32),

  // Firebase FCM（選填）
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),

  // AWS S3（選填）
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  /** S3 bucket 內的最上層 prefix（環境隔離用，如 local / staging / production） */
  AWS_MEDIA_LIBRARY_ROOT: z.string().min(1),

  // ─── 檔案儲存 ───
  // driver：local（寫本機、免 AWS，dev / 衍生專案預設）或 s3（走 AWS + presigned URL）
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  // local driver：上傳落地目錄（相對 cwd）與對外服務的 URL 前綴
  LOCAL_MEDIA_ROOT: z.string().default('media'),
  LOCAL_MEDIA_BASE_URL: z.string().default('/media'),
  // 單檔上傳大小上限（bytes），預設 5MB
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5_242_880),

  // SMTP（選填）
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // 分頁
  DEFAULT_PAGE_LIMIT: z.coerce.number().int().positive().default(15),

  // 權限快取 TTL（秒），角色/權限變更最多延遲此時間生效
  PERMISSION_CACHE_TTL: z.coerce.number().int().positive().default(300),

  // bcrypt rounds（測試環境設低值加速，生產環境建議 ≥ 12）
  BCRYPT_ROUNDS: z.coerce.number().int().min(1).default(10),

  // ─── 速率限制 ───
  COMMON_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  COMMON_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // ─── 反向代理 ───
  // Express trust proxy：決定 request.ip 是否採信 X-Forwarded-For。
  // 預設 'loopback'（只信任本機、不採信外部 XFF）= 安全；部署在 LB/反向代理後面時，
  // 依拓樸改為信任跳數（如 '1'）或具體 proxy CIDR，切勿用 'true'（會無條件採信偽造 XFF）。
  TRUST_PROXY: z.string().default('loopback'),

  // ─── 功能開關（Feature Flags） ───
  APPLICATION_ADMIN_ROLE_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  APPLICATION_AUTH_LOG_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  APPLICATION_IP_WHITELIST_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  APPLICATION_IP_BLACKLIST_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  APPLICATION_ACCOUNT_LOCK_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  APPLICATION_PASSWORD_CHANGE_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  APPLICATION_SESSION_IDLE_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  APPLICATION_GOOGLE_RECAPTCHA_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  APPLICATION_API_LOG_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  APPLICATION_OPERATION_LOG_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  /**
   * 日誌保留排程。**預設啟用**——system_logs 在 API log 開啟時每個請求寫一筆
   * 且完整存 request/response 的 Text 欄位，沒有保留策略會無界成長，
   * 而這兩張表目前只寫不讀。關掉前請確認你有別的清理機制。
   */
  LOG_PURGE_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  /** 日誌保留天數，早於此天數的 system_logs / auth_logs 會被刪除 */
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  /** 清理排程的 cron 表達式（秒 分 時 日 月 週），預設每日 03:00 */
  LOG_PURGE_CRON: z.string().default('0 0 3 * * *'),

  /**
   * Redis 不可用時的節流策略。預設 `false` = fail-closed（拒絕請求，回 429）。
   *
   * 設為 `true` 換取可用性，但要清楚代價：Redis 一掛，全站速率限制同時歸零，
   * 包含登入與 forgot-password——暴力破解防護會在最需要的時刻消失。
   */
  THROTTLE_FAIL_OPEN: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // ─── 可觀測性（Observability，皆預設關閉） ───
  APPLICATION_SENTRY_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SENTRY_DSN: z.string().optional(),
  // 0 = 不採樣 trace；production 視流量調至 0.1 等小數
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  APPLICATION_METRICS_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // ─── 密碼策略 ───
  APPLICATION_PASSWORD_MIN_LENGTH: z.coerce.number().int().min(1).default(8),
  APPLICATION_PASSWORD_MAX_LENGTH: z.coerce.number().int().min(1).default(32),
  APPLICATION_SYSTEM_ADMIN_PASSWORD_COMPLEXITY: z.coerce
    .number()
    .int()
    .pipe(
      z.union([
        z.literal(0),
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
      ]),
    )
    .default(4),
  APPLICATION_OTHER_ADMIN_PASSWORD_COMPLEXITY: z.coerce
    .number()
    .int()
    .pipe(
      z.union([
        z.literal(0),
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
      ]),
    )
    .default(1),
  APPLICATION_PASSWORD_CHANGE_PERIOD: z.coerce.number().int().min(0).default(6),
  APPLICATION_IS_LOGOUT_AFTER_PASSWORD_RESET: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // ─── 帳號鎖定 ───
  APPLICATION_ACCOUNT_LOCK_THRESHOLD: z.coerce.number().int().min(1).default(3),
  APPLICATION_IP_BLOCK_THRESHOLD: z.coerce.number().int().min(1).default(5),

  // ─── Google reCAPTCHA ───
  GOOGLE_RECAPTCHA_SECRET: z.string().optional(),
  GOOGLE_RECAPTCHA_SITE_KEY: z.string().optional(),
  GOOGLE_RECAPTCHA_VERSION: z.enum(['v2', 'v3']).default('v2'),
  GOOGLE_RECAPTCHA_IS_PRODUCTION: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // ─── 閒置自動登出 ───
  APPLICATION_SESSION_IDLE_TIMEOUT: z.coerce.number().int().min(1).default(120),

  // ─── 密碼重設 ───
  APP_PASSWORD_RESET_TOKEN_EXPIRES_IN: z.coerce
    .number()
    .int()
    .min(1)
    .default(30),
  APP_PASSWORD_RESET_URL: z.string().optional(),

  // ─── Seed 預設帳號 ───
  ADMIN_DEFAULT_EMAIL: z.string().default('admin@test.com'),
  ADMIN_DEFAULT_PASSWORD: z.string().default('Admin1234!'),
  // seed-runner 的生產環境擋關：僅在 NODE_ENV=production 時有意義，
  // 語意是「有設值即放行」（`ALLOW_PROD_SEED=1`），故不轉成 boolean
  ALLOW_PROD_SEED: z.string().optional(),

  //應用時區 ───
  APP_TIMEZONE: z
    .string()
    .default('Asia/Taipei')
    .refine(
      (v) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      },
      { message: '無法被 Intl 解析的 IANA 時區' },
    ),

  //任務 alarm 排程 ───
  NOTIFICATION_ALARM_HOUR: z.coerce.number().int().min(0).max(23).default(8),
  NOTIFICATION_ALARM_MINUTE: z.coerce.number().int().min(0).max(59).default(0),

  // ─── 排程（@nestjs/schedule，範例排程預設關閉） ───
  /** 範例排程是否啟用；正式排程依需求改寫 ExampleScheduler，測試環境保持關閉 */
  SCHEDULE_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  /** 範例排程 cron（@nestjs/schedule 6 欄位含秒），預設每分鐘第 0 秒 */
  SCHEDULE_EXAMPLE_CRON: z.string().default('0 * * * * *'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export const getEnv = (): Env => {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    log.error('環境變數驗證失敗');
    result.error.issues.forEach((issue) => {
      log.error(
        { field: issue.path.join('.'), message: issue.message },
        '驗證錯誤',
      );
    });
    process.exit(1);
  }

  _env = result.data;

  if (_env.NODE_ENV === 'production') {
    const productionErrors: string[] = [];
    if (_env.CORS_ORIGIN === '*') {
      productionErrors.push(
        'CORS_ORIGIN: 生產環境不允許設定為 *，請指定明確的來源網域',
      );
    }
    if (!_env.DB_PASSWORD) {
      productionErrors.push('DB_PASSWORD: 生產環境不允許空密碼');
    }
    if (
      _env.ACCESS_SECRET.includes('change-in-production') ||
      _env.ACCESS_SECRET.length < 32
    ) {
      productionErrors.push(
        'ACCESS_SECRET: 不可使用預設佔位值，請設定至少 32 字元的隨機字串',
      );
    }
    if (
      !_env.REFRESH_SECRET ||
      _env.REFRESH_SECRET.includes('change-in-production') ||
      _env.REFRESH_SECRET.length < 32
    ) {
      productionErrors.push('REFRESH_SECRET: 生產環境必填且至少 32 字元');
    }
    if (
      _env.COOKIE_SECRET.includes('change-in-production') ||
      _env.COOKIE_SECRET.startsWith('test-')
    ) {
      productionErrors.push(
        'COOKIE_SECRET: 不可使用預設佔位值，請設定至少 32 字元的隨機字串',
      );
    }
    if (_env.BCRYPT_ROUNDS < 12) {
      productionErrors.push(
        'BCRYPT_ROUNDS: 生產環境建議設定為 12 以上以確保密碼安全性',
      );
    }
    if (!process.env.APP_TIMEZONE || process.env.APP_TIMEZONE.trim() === '') {
      productionErrors.push('APP_TIMEZONE: 生產環境必填（例：Asia/Tokyo）');
    }
    if (!_env.APPLICATION_ADMIN_ROLE_ENABLED) {
      productionErrors.push(
        'APPLICATION_ADMIN_ROLE_ENABLED: 生產環境必須開啟，否則 RolesGuard 失效（@Roles 裝飾無作用）',
      );
    }
    if (productionErrors.length > 0) {
      productionErrors.forEach((msg) => log.error(msg));
      process.exit(1);
    }
  }

  return _env;
};

/** 測試專用：重置 singleton，讓下次 getEnv() 重新解析 process.env */
export const _resetEnvForTest = (): void => {
  _env = null;
};
