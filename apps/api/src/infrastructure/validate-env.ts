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
  // 5432 = PostgreSQL。模板時期是 MySQL，預設值一度留在 3306——
  // 沒設定 DB_PORT 的環境會去連一個不存在的服務，而錯誤訊息只會說「連不上」
  DB_PORT: z.coerce.number().default(5432),
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
  JWT_ISSUER: z.string().default('nexus-api'),
  JWT_AUDIENCE: z.string().default('nexus-web'),
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
   * 聊天資料的保留排程是否啟用。
   *
   * **與 `LOG_PURGE_ENABLED` 刻意分開。** 兩者的失效後果不同：日誌關掉只是磁碟長大，
   * 稽核關掉會讓日後的調查沒有依據。共用一個開關會讓「調整日誌保留」這個低風險操作
   * 順手改到稽核。
   *
   * 用 `z.enum` 而非鄰近變數慣用的 `z.string()`：後者把任何非 `'true'` 的值都當成 false，
   * 因此 `=TRUE`（大寫）會靜默關閉清理。
   */
  CHAT_RETENTION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /**
   * 聊天稽核紀錄的保留天數。
   *
   * 它的用途是「這個人在被檢舉前做了什麼」——檢舉通常在事發後數天內提出，
   * 半年的回溯窗遠超實際需要；而它是聊天相關資料表中成長最快的
   * （每次加入／離開房間、被限流、撤回被拒、提出檢舉、查看檢舉都寫一筆）。
   */
  CHAT_AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
  /**
   * 檢舉的保留天數，**自判定時間起算**。
   *
   * 未判定（PENDING）的檢舉永不清理：按建立時間清會讓積壓的佇列靜默地把證據刪掉，
   * 而積壓正是最需要那些證據的時候。
   */
  CHAT_REPORT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  /** 聊天資料清理排程的 cron 表達式，預設每日 03:30（錯開日誌清理） */
  CHAT_RETENTION_CRON: z.string().default('0 30 3 * * *'),

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
  /**
   * 帳號鎖定的時效（分鐘）。
   *
   * **沒有時效的鎖定是一個沒有復原路徑的死結**：鎖定的檢查排在密碼驗證之前，
   * 被鎖的帳號連「密碼打對」都到不了清除計數那條路；而人工解鎖的端點需要一個
   * 已登入且具 SUPERADMIN 的管理員。把已知的管理員 email 全鎖一輪，就沒有人能登入解鎖——
   * 而觸發鎖定完全不需要認證，也不需要猜對密碼。
   *
   * 時效**不解決**「持續攻擊者可以每 N 分鐘重鎖一次」，那是 per-IP 限制的職責
   * （`APPLICATION_IP_BLOCK_THRESHOLD`）。它解決的是「永久且無復原路徑」。
   */
  APPLICATION_ACCOUNT_LOCK_DURATION_MIN: z.coerce
    .number()
    .int()
    .min(1)
    .default(15),
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

  // ─── WebSocket ───
  /** 連線的心跳間隔（秒）。presence 靠它續期，太稀疏會讓殭屍存活更久 */
  WS_HEARTBEAT_INTERVAL: z.coerce.number().int().min(1).default(15),
  /**
   * 陳舊判定倍數：超過 `心跳間隔 × 此值` 未更新的連線視為已失效。
   *
   * 這是唯一能自動回收「實例被強制終止」所留下之紀錄的機制，不能設為 1——
   * 單次心跳因網路抖動延遲就會誤判在線使用者為離線。
   */
  WS_STALE_MULTIPLIER: z.coerce.number().int().min(2).default(3),
  /**
   * 離線廣播的延遲（秒）。使用者斷線後不立即廣播離線，等這段時間確認沒有重連。
   *
   * 沒有這段延遲時，一次換頁或短暫斷網會讓聯絡人看到「離線→上線」跳動。
   */
  WS_OFFLINE_BROADCAST_DELAY: z.coerce.number().int().min(0).default(5),
  /** 單一成員允許的同時連線數上限（多裝置、多分頁），超過時拒絕最新的連線 */
  WS_MAX_CONNECTIONS_PER_MEMBER: z.coerce.number().int().min(1).default(10),
  /**
   * 送訊息的限流：每人每房間在一個視窗內允許的則數。
   *
   * 閾值放環境變數而非寫死：實際值要等真實使用資料才調得準，而為了調一個數字
   * 改程式碼、重新部署，最後的結果是沒有人去調。預設值是保守的起點，不是建議值。
   */
  WS_MESSAGE_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
  /** 送訊息限流的視窗長度（秒） */
  WS_MESSAGE_RATE_WINDOW_SEC: z.coerce.number().int().min(1).default(10),
  /**
   * 單一 WebSocket **連線**在一個視窗內允許的事件數。
   *
   * 與 `WS_MESSAGE_RATE_LIMIT` 是兩道獨立的防線，不可互相取代：
   * 這一道保護的是**這個行程的事件迴圈**（計數單位是單一連線），
   * 那一道保護的是**房間不被洗版**（計數單位是成員 + 房間，跨連線跨實例）。
   * 開 N 條連線就能繞過這一道，但繞不過那一道。
   *
   * 門檻刻意設在遠高於任何合理客戶端的水準——它是「明顯失控」的界線而非精細控制。
   * 設太低會誤傷合理的批次操作（例如重連後連續 join 多個房間），
   * 而那類誤傷會以「偶爾有房間加不進去」的形式出現，很難查。
   */
  /**
   * 營運總覽的推送間隔（秒）。
   *
   * 查詢是**實例級**的：實例上有 1 個或 10 個管理員在看，資料庫的查詢次數都一樣，
   * 所以這個值決定的是「每個實例每秒幾次查詢」而不是「每人幾次」。
   * 調短的代價是資料庫負載，調長的代價是數字更舊——後者對「有沒有事」影響很小。
   */
  DASHBOARD_STREAM_INTERVAL_SEC: z.coerce.number().int().min(1).default(5),
  WS_CONNECTION_EVENT_LIMIT: z.coerce.number().int().min(1).default(20),
  /** 連線層事件限流的視窗長度（秒） */
  WS_CONNECTION_EVENT_WINDOW_SEC: z.coerce.number().int().min(1).default(1),
  /**
   * 訊息可撤回的時限（秒）。
   *
   * 撤回的用途是「剛剛傳錯了」，不是「抹除歷史」——不設時限等於讓對話紀錄
   * 隨時可被單方面改寫，而對方早已讀過。時限以伺服器的 createdAt 為準，
   * 不看客戶端時間：那是個授權判斷，而客戶端的時鐘不可信。
   */
  CHAT_RETRACT_WINDOW_SEC: z.coerce.number().int().min(1).default(300),
  /**
   * 聊天行為稽核是否啟用。
   *
   * **刻意與 `APPLICATION_METRICS_ENABLED` 分開。** 兩者的失效模式不同：
   * 指標關掉只是看不到趨勢，稽核關掉會讓日後的調查沒有依據。共用開關會讓
   * 「暫時關掉指標降低負載」這個合理操作順手把稽核也關了，
   * 而那要等到真的需要調查時才會發現。
   *
   * 用 `z.enum` 而非鄰近變數慣用的 `z.string()`：後者把任何非 `'true'` 的值
   * 都當成 false，因此 `CHAT_AUDIT_ENABLED=TRUE`（大寫）會**靜默關閉稽核**。
   * 對預設開啟的安全性開關，寧可在啟動時就失敗。
   */
  /**
   * 是否掛載 Swagger UI 與 OpenAPI spec。
   *
   * **未設定時的預設值依 `NODE_ENV`**（見 `isSwaggerEnabled()`）：production 為 false、
   * 其餘為 true。固定預設 true 會讓忘記設定的 production 裸奔——
   * `/api/admin/docs-json` 是一份完整的後台地圖（所有端點、參數 schema、錯誤碼、權限碼命名），
   * 而它掛在 `app.use()` 上，**全域 JwtAuthGuard 根本碰不到**（Nest 的 guard 只作用於 Nest 路由）。
   * 固定預設 false 則會讓開發者第一次跑起來就找不到文件。
   *
   * 預設值唯一該有的性質是「什麼都不設就是對的」，而這裡的「對」在兩種環境下不同。
   */
  SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
  CHAT_AUDIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

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

/**
 * Swagger 文件是否該掛載。
 *
 * `SWAGGER_ENABLED` 未設定時依 `NODE_ENV` 推導：production 關、其餘開。
 * 明確設定永遠優先於推導。
 *
 * 判定拆成 `resolveSwaggerEnabled` 這支純函式：測試要 mock `getEnv` 的話，
 * 模組內部的呼叫仍然指向真正的實作（partial mock 蓋不到自己人），
 * 而純函式沒有這個問題。
 *
 * @returns true 代表 `/docs` 與 `/docs-json` 都該掛載
 */
export const resolveSwaggerEnabled = (
  nodeEnv: string,
  explicit: 'true' | 'false' | undefined,
): boolean =>
  explicit === undefined ? nodeEnv !== 'production' : explicit === 'true';

export const isSwaggerEnabled = (): boolean => {
  const env = getEnv();
  return resolveSwaggerEnabled(env.NODE_ENV, env.SWAGGER_ENABLED);
};

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
