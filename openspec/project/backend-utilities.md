# 後端工具與產生器

> 日誌、資料脫敏、Zod 驗證、日期工具、檔案儲存、Seed、System Log、分頁、可觀測性（指標與行為稽核），以及 gen:module 產生器。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

### 日誌系統

使用 `nestjs-pino` + `pino-http`：

- 開發：`pino-pretty` 彩色輸出至 stdout
- 生產：`pino-roll` 寫檔，每檔 5MB 自動輪轉
  - `apps/api/logs/combined.log` — 所有等級
  - `apps/api/logs/error.log` — 僅 error
- 測試：關閉 pino-roll

每筆請求自動帶 `requestId`（`randomUUID()`），可用於跨日誌追蹤。

**敏感欄位自動脫敏**：`app.module.ts` 的 pino `redact` 逐一列舉路徑（`req.body.password`、`newPassword`、`oldPassword`、`confirmPassword`、`token`、`refreshToken`、`accessToken`、`req.headers.authorization` / `cookie`）。pino 的 redact **不支援子字串比對**，只能列舉——與 `sanitize.ts` 的策略不同。這是縱深防禦：`serializers.req` 目前只留 `id/method/url`，body 本來就不會進 log。

### 資料脫敏

`apps/api/src/infrastructure/sanitize.ts` 提供多層脫敏，自動套用於 System Log 的 request / response：

| 場景 | 比對方式 | 行為 |
| --- | --- | --- |
| 物件欄位名稱 | **子字串**（`password` / `token` / `secret` / `credential` / `apikey` / `privatekey` / `authorization` / `cookie` / `bearer`，去底線連字號後比對） | 值替換為 `[REDACTED]` |
| Base64 圖片資料（`data:image/...`） | 前綴 | 替換為 `[BASE64_IMAGE_REMOVED]` |
| `file` / `files` 欄位 | 精確 | 替換為 `[FILE_DATA_REMOVED]` |
| URL query 參數（`email` / `phone` / `name` / `token` / `key`） | **精確** | 值替換為 `[REDACTED]` |

**同一支檔案兩種相反策略，是刻意的**：body 用子字串因為敏感欄位的變形是開放集合
（`newPassword` 就漏過一次，讓 reset-password 的新密碼明文寫進 `system_logs`），
少遮一次是憑證外洩、多遮一次只是少一條除錯資訊；query 用精確比對因為子字串會讓
`key` 吃掉 `keyword`、`name` 吃掉所有 `*Name` 過濾條件，而 URL 帶的是 PII 不是機密。
`sanitize-coverage.spec.ts` 會掃 request DTO 的欄位名，把看起來敏感的實際餵進
`sanitize()` 驗證真的被遮。

### Zod 驗證

DTO 使用 `ZodValidationPipe` 搭配 Zod schema，於 route 層級套用：

```typescript
// dto/CreateXxxRequest.ts
export const createXxxSchema = z.object({ name: z.string().min(1) });
export type CreateXxxRequest = z.infer<typeof createXxxSchema>;

// XxxController.ts
@Post()
create(@Body(new ZodValidationPipe(createXxxSchema)) dto: CreateXxxRequest) {}
```

驗證失敗會 throw `BadRequestException`，由 `GlobalExceptionFilter` 包裝回 `{ code: 'BAD_REQUEST' }`。

### 日期工具

`apps/api/src/infrastructure/date.ts` 提供預設時區與中文語系的 dayjs 實例（時區由 `APP_TIMEZONE` 控制）：

```typescript
import dayjs, { formatDate, formatYMD, formatDateWithDay } from '../infrastructure/date';

formatDate(new Date());        // "2026-04-05"
formatYMD(2026, 4, 5);         // "2026年04月05日"
formatDateWithDay(new Date()); // "2026-04-05 (日)"
```

### 檔案儲存與上傳安全

儲存走 port + driver 切換（`STORAGE_DRIVER=local|s3`），module 依 env 綁定實作，呼叫端只認 port。

上傳安全三件套，缺一不可：

| 措施 | 作法 |
| --- | --- |
| MIME 白名單 | 只允許明列的 content-type |
| 副檔名由 MIME 推導 | **不信任使用者送來的檔名副檔名** |
| 大小上限 | `MAX_UPLOAD_BYTES`，超過即拒 |

其他要點：multipart 的中文檔名需 latin1→UTF-8 還原；刪除時 key 由 fileUrl 尾兩段還原（與 base URL / driver 無關）；本機媒體 static 要排除 SPA fallback 並加 `nosniff` / CSP。

### Seed 管理

Seed 檔案放在 `apps/api/seeds/`，timestamp 前綴確保執行順序，透過 `SeedHistoryRecord` 做冪等控制：

```
apps/api/seeds/
├── 20260101000001-seed-permissions.ts   # 初始化 Permission 代碼
├── 20260101000002-seed-roles.ts         # 初始化角色（SUPERADMIN）
├── 20260101000003-seed-test-members.ts  # 建立預設管理員帳號
└── YYYYMMDDHHMMSS-seed-xxx.ts
```

新增 seed：

```typescript
// seeds/YYYYMMDDHHMMSS-seed-xxx.ts
import { PrismaClient } from '@prisma/client';

export default async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.xxx.upsert({ ... });
}
```

執行：`pnpm --filter @app/api db:seed`。**production 環境會被擋下**（除非設定 `ALLOW_PROD_SEED=1`）。

### 欄位描述（schema 與資料庫兩層）

`schema.prisma` 的欄位以 `///` 撰寫描述，內容寫**這個欄位在系統中扮演什麼角色、有什麼陷阱**，
不是把欄位名翻成中文。`id`、一般的 `created_at` / `updated_at` 這類自明欄位不寫。

描述要落在兩個地方，兩者來源相同但機制完全不同：

| 位置 | 怎麼來的 | 誰會看到 |
| --- | --- | --- |
| Prisma Client 的 JSDoc | `prisma generate` 自動帶入 `///` | 寫程式時 IDE hover / 自動完成 |
| PostgreSQL 的 `COMMENT ON` | **手動寫進 migration** | `psql \d+`、DBeaver、直接查庫的人 |

**Prisma 不會從 `///` 產生 `COMMENT ON`**——這是最容易誤解的一點：只加 `///` 的話
migration 完全不會有任何差異，資料庫端永遠是空的。

因此改動 `///` 之後要開一支新 migration 承載更新後的註解，SQL 由產生器輸出而非手寫：

```bash
pnpm --filter @app/api gen:comments >> prisma/migrations/<新migration>/migration.sql
```

`COMMENT ON` 是冪等的，重下同一個欄位會直接覆蓋舊描述，不需要先刪除。

> 目前「改了 `///` 但忘記開 migration」沒有任何檢查會發現，屬於自律項。

### System Log

`apps/api/src/modules/system-log.module.ts` 透過 `SaveSystemLogPort` 將請求記錄寫入 DB（`PrismaSystemLogRepository`）。欄位：

| 欄位                           | 說明                            |
| ------------------------------ | ------------------------------- |
| `userId`                       | 登入使用者 ID（未登入為空）     |
| `action`                       | 動作描述                        |
| `method`                       | HTTP 方法                       |
| `url`                          | 請求路徑（query string 已脫敏） |
| `statusCode`                   | HTTP 狀態碼                     |
| `execTime`                     | 執行時間（ms）                  |
| `requestTime` / `responseTime` | 請求與回應時間                  |

成功路徑由 `LoggingInterceptor` 處理，錯誤路徑由 `GlobalExceptionFilter` 處理，共用 `system-log-helper.ts` 的 `buildSystemLogData()`。

#### 日誌保留策略（預設啟用）

`system_logs` 與 `auth_logs` 目前**只寫不讀**——整個 `src/` 只有 `create`，沒有任何查詢。
而 `system_logs` 在 `APPLICATION_API_LOG_ENABLED=true` 時**每個 API 請求寫一筆**，
且完整存 request / response 的 `@db.Text`。它會是資料庫成長最快的物件。

因此 `LogRetentionScheduler` **預設啟用**，每日清掉超過保留天數的紀錄：

| 環境變數 | 預設 | 說明 |
| --- | --- | --- |
| `LOG_PURGE_ENABLED` | `true` | 關掉前請確認有別的清理機制，否則兩張表無界成長 |
| `LOG_RETENTION_DAYS` | `90` | 早於此天數的紀錄會被刪除 |
| `LOG_PURGE_CRON` | `0 0 3 * * *` | 每日 03:00（秒 分 時 日 月 週） |

預設開而非預設關，是因為兩種失效的代價不對稱：沒有保留策略會讓資料庫無界成長，
而「刪掉 90 天前、沒有任何功能在讀的日誌」幾乎沒有損失。日誌 flag 全關時，
排程每天只是跑一次刪不到東西的批次。

清理採**分批**（每批 5000 筆、批間讓出 100ms），不是單一 `deleteMany`：
單一 `DELETE` 本身就是一個交易，對一個跑了一年、累積數百萬列的部署，
第一次執行那一發會長時間持鎖、阻塞同表寫入——**防止資料庫爆掉的機制自己造成一次事故**。
批次有上限（2000 批）作為無限迴圈的保險，達上限會記 warn 並由下次排程接續。

**多副本部署要注意**：`LogRetentionScheduler` 在每個實例的 `onModuleInit` 都會註冊 cron，
水平擴展到 N 個副本時凌晨三點會有 N 個相同的刪除同時打進去互相卡鎖。
專案已有 Redis，用一把短 TTL 的分散式鎖（`SET key NX EX`）即可收斂成單一執行者。
單副本不受影響，這裡先記著。

**若之後要補稽核查詢端點**，兩張表已有 `createdAt` / `email` / `memberId` 複合索引
（`20260816200000_add_log_indexes`），不必再補。測試環境於 `setup-env*.ts`
強制關閉此排程——cron job 會留下 open handle。

### 分頁

`apps/api/src/infrastructure/pagination.ts`：

```typescript
import { getPagination, buildPaginationMeta } from '../infrastructure/pagination';

const { page, limit, offset } = getPagination(query);
const meta = buildPaginationMeta(page, limit, totalCount);
// { page, limit, total, totalPages }
```

`page` 最小 1；`limit` 預設來自 `DEFAULT_PAGE_LIMIT`，上限 100。

### 新增 Domain Module 範本

**一律用產生器，不要手刻**：`pnpm --filter @app/api gen:module <name> [--admin|--front]`

產生器**自動**完成（以 `order` 為例）：

```
domain/exception/OrderNotFoundException.ts          # 引用 ResponseCodes，靜態訊息只傳 (code, kind)
application/port/{in,out}/…/                        # Inbound / Outbound Port
application/service/<side>/order/                   # Use Case 實作 + spec
application/facade/<side>/OrderFacade.ts
adapter/out/persistence/order/PrismaOrderRepository.ts
adapter/in/web/<side>/order/{OrderController,…Request}.ts
modules/<side>/order.module.ts
app.module.ts                                       # 自動註冊 OrderModule
shared/constants/response-codes.ts                  # 自動注入 ORDER_NOT_FOUND
shared/constants/response-messages.ts               # 自動注入對應訊息（型別要求兩者成對）
docs/swagger/<side>/orders/*.yaml                   # 5 支 endpoint 的 yaml 骨架
docs/swagger/<side>/openapi.yaml                    # 自動註冊 paths
→ 自動重跑 swagger:bundle 與 api-client generate
```

**產出物零手改即通過 `typecheck` / `lint` / 全部架構守則**（唯一例外是 Prisma model 尚未建立造成的型別錯誤）。

你要手動完成的：

```
1. prisma/schema.prisma          # 加 OrderRecord model → db:migrate
2. 依實際欄位調整 DTO / port / service / Prisma repo
3. 同步 docs/swagger/<side>/orders/ 的 yaml 骨架（欄位、描述）
4. 視需要在 Controller 掛權限 guard（見 RoleController）
5. test/order.e2e-spec.ts        # E2E 測試（用 test/helpers/assertions.ts 的共用斷言）
```

> **`GlobalExceptionFilter` 不需要修改** —— domain exception 的 `kind` 會自動映射 HTTP status。

> 若 Controller 使用 `JwtAuthGuard`，記得在對應 Module 的 `imports` 加入 `JwtModule`。
>
> 以下模組標記為 `@Global()`，全域可注入，新模組**不需要** import：
> - `RedisModule` — `TOKEN_BLACKLIST_PORT`、`CLEAR_MEMBER_CONTEXT_PORT`、`MEMBER_CONTEXT_CACHE_PORT`、`SESSION_ACTIVITY_PORT`
> - `FeatureFlagModule` — `FeatureFlagService`
> - `AuthLogModule` — `SAVE_AUTH_LOG_PORT`
> - `SecurityModule` — `ACCOUNT_LOCK_PORT`、`IP_BLOCK_PORT`、`IP_LIST_PORT`
> - `RecaptchaModule` — `RECAPTCHA_VERIFY_PORT`

---

### 可觀測性：指標與行為稽核

兩者都經 out port 呼叫，業務層不碰實作細節。**各自獨立開關**——指標關掉只是看不到趨勢，
稽核關掉會讓日後的調查沒有依據，綁在一起會讓「暫時關掉指標降低負載」順手把稽核也關了。

| | 指標 | 行為稽核 |
| --- | --- | --- |
| Port | `MetricsPort` | `ChatAuditPort` |
| 實作 | `adapter/out/metrics/` | `adapter/out/persistence/chat-audit/` |
| 開關 | `APPLICATION_METRICS_ENABLED` | `CHAT_AUDIT_ENABLED` |
| 關閉時 | 綁 no-op 實作（業務碼不需判斷） | 實作內直接返回 |

#### 新增一個指標

1. `MetricsPort` 加方法（**參數不得包含無界的值**，例如房間 ID——標籤基數爆炸會拖垮 Prometheus）
2. `PrometheusMetricsAdapter` 實作、`METRIC_NAMES` 加名稱
3. `metrics.module.ts` 的 provider 工廠加對應的 `makeCounterProvider` / `makeHistogramProvider` / `makeGaugeProvider`
4. `NoopMetricsAdapter` 補上同名方法（`void 參數` 明示「知道它存在、就是不做事」）

Gauge 類的指標**不要自己加 instanceId 標籤**：Prometheus 依 scrape target 自動帶，
自己加會讓實例重啟產生一條新的時間序列，舊的永遠停在最後一個值。

#### 新增一個稽核事件

判準是「**這件事發生過的證據會不會消失**」，不是「這件事重不重要」。

送出訊息**不記**——`chat_messages` 已經記了發送者、房間、時間、序號，再寫一筆稽核只是把
同一份中繼資料存兩次。真正該記的是那些不會自己留下紀錄的行為：離開房間（成員關係列被直接刪除）、
被限流擋下、撤回被拒。

1. `ChatAuditPort` 的 `ChatAuditAction` 聯集加一個值（**不要用 string**，typo 會產生沒人發現的新類別）
2. `schema.prisma` 的 `ChatAuditAction` enum 加同一個值 + migration
3. 在對應的 service 呼叫，**必須 `catch` 並以 error 等級記錄**——稽核是 best-effort，
   稽核表滿了不該讓使用者送不出訊息。有守則（`observability.spec.ts`）檢查每個呼叫點都有接住錯誤

**稽核紀錄不得包含訊息內容。** 內容已在 `chat_messages`（撤回也保留），
複製一份等於多一條洩漏路徑，而且兩份的遮蔽規則必須同步維護。

#### 測試開關關閉的行為

`getEnv()` 內部有快取，**執行期改 `process.env` 不會生效**。要驗「關閉時不寫入」
只能在單元測試裡 `jest.mock('@app/infrastructure/validate-env')` 並 mock `getEnv`
（見 `PrismaChatAuditRepository.spec.ts`）。e2e 改不動它。

