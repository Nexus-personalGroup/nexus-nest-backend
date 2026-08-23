# 後端執行期行為

> 認證流程、環境變數、RBAC 權限系統、全域中介層、API 回應格式、功能開關與安全設定。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

## 認證流程

- **登入**：POST `/auth/login` → 後端回 `{ accessToken, refreshToken, accessTokenExpiresIn, refreshTokenExpiresIn, member }` → 前端存 `localStorage.access_token` → 導向 `/`。
- **每次請求**：`apiClient` 的 onRequest middleware 自動帶 `Authorization: Bearer <token>`，token 由 `tokenStorage.get()` 即時讀（**不快取**，更新後立即生效）。
- **JwtAuthGuard 安全檢查**：payload 必須有 `type: 'access'`，否則拒絕（防止 refresh token 當 access 用）。
- **快取一致性**：變更 member `status` / `roleId` / 密碼後必須呼叫 `clearMemberContext(memberId)`，否則最長延遲 `PERMISSION_CACHE_TTL` 秒（預設 300s）。
- **401 處理**：前端 apiClient 統一清 token + 跳 login（middleware 處理）。

---

## 環境變數

- 後端：`apps/api/.env`（範本 `apps/api/.env.example`）。
- **新增 env 變數必須同步加入 `apps/api/src/infrastructure/validate-env.ts` 的 Zod schema**（並更新 `.env.example`）：漏加驗證的 env 在缺值 / 型別錯時不會被擋，運行期才以 `undefined` 靜默出錯；production 專屬強制檢查（CORS `*`、`BCRYPT_ROUNDS` 下限等）也一併在此宣告。
- 前端：若需要走 Vite 環境變數，鍵名以 `VITE_` 開頭，放 `apps/web/.env`。目前無前端環境變數需求。
- **CORS_ORIGIN**：支援逗號分隔多 origin，預設 `http://localhost:3000,http://localhost:5173`。
- **`*` 在生產環境會擋下**：validate-env 強制要求明確指定 origin。
- **可觀測性（皆預設關閉）**：`APPLICATION_SENTRY_ENABLED` + `SENTRY_DSN`（+ `SENTRY_TRACES_SAMPLE_RATE`）開啟 Sentry 錯誤上報；`APPLICATION_METRICS_ENABLED` 掛載 Prometheus `/api/metrics`。此兩開關由 `getEnv()` 直讀（非 `FeatureFlagService`）：Sentry 在 `instrument.ts` 的 `Sentry.init({ enabled })` 控制、未啟用時 `captureException` 為 no-op；Metrics 在 `app.module.ts` imports 條件式掛載、關閉時完全不註冊端點。
- **單一埠部署**：`WEB_STATIC_ROOT` 指定前端打包根目錄（未設則由 api 相對自身編譯輸出找 `apps/web/dist`）。設定後 `node dist/main` 同一個埠同時服務前端 SPA + API：`ServeStaticModule.forRootAsync` 在 init 時偵測 `index.html`（無則略過掛載），`exclude: ['/api/{*path}']` 確保 `/api` 不被 SPA fallback 攔截；dev 仍走 Vite proxy 不受影響。
- **排程（@nestjs/schedule，預設關閉）**：`SCHEDULE_ENABLED` 開關範例排程、`SCHEDULE_EXAMPLE_CRON`（6 欄位含秒）設 cron。排程器以 `onModuleInit` 動態註冊（`@Cron` decorator 在模組載入時求值、早於 dotenv 讀不到 `.env`），範式見 `apps/api/src/adapter/in/scheduler/ExampleScheduler.ts`；時區用 `APP_TIMEZONE`。

---

## 後端模組功能參考

### API 端點總覽

後台端點以 `/api/admin` 為前綴、前台以 `/api/front`；health 為中性 `/api/health`。Swagger UI：後台 `http://localhost:3000/api/admin/docs`、前台 `http://localhost:3000/api/front/docs`。

| 群組     | 路徑                                | 權限                                     |
| -------- | ----------------------------------- | ---------------------------------------- |
| Auth     | `/api/admin/auth/{login,refresh,logout,forgot-password,reset-password}` | 公開（含 reCAPTCHA） |
| Me       | `GET /api/admin/me`                 | JWT                                      |
| Members  | `GET/POST/PATCH/DELETE /api/admin/members*` | JWT + `BACKEND:ACCOUNT:VIEW/EDIT` 權限 |
| Roles    | `GET/POST/PATCH/DELETE /api/admin/roles*` | JWT + `BACKEND:ROLE:VIEW/EDIT` 權限      |
| Attachments | `POST/DELETE /api/admin/attachments*` | JWT + `BACKEND:ATTACHMENT:EDIT`；刪除另需為上傳者或 SUPERADMIN |
| Security | `/api/admin/security/ip-{whitelist,blacklist}*`、`/api/admin/security/unlock-account` | JWT + ADMIN 角色 |
| Attachments | `POST /api/admin/attachments`（multipart 上傳）、`DELETE /api/admin/attachments/{id}` | JWT |
| Front    | `GET /api/front/ping`（骨架示範，待實際前台端點取代） | 公開                        |
| Health   | `GET /api/health`（liveness）、`GET /api/health/ready`（readiness，探 DB + Redis） | 公開（中性、不加 /admin，不計速率限制） |
| Metrics  | `GET /api/metrics`（Prometheus，flag 開啟才掛載） | 公開（不計入速率限制；需網路層保護）     |

### RBAC 權限系統

資料表：

- `roles` — 角色；`isDefault = true` 的角色為新帳號的預設角色
- `permissions` — 權限代碼
- `role_permissions` — 多對多關聯

| PermissionCode 常數    | 代碼字串               |
| ---------------------- | ---------------------- |
| `BACKEND_ACCOUNT_VIEW` | `BACKEND:ACCOUNT:VIEW` |
| `BACKEND_ACCOUNT_EDIT` | `BACKEND:ACCOUNT:EDIT` |
| `BACKEND_ROLE_VIEW`    | `BACKEND:ROLE:VIEW`    |
| `BACKEND_ROLE_EDIT`    | `BACKEND:ROLE:EDIT`    |
| `BACKEND_ATTACHMENT_EDIT` | `BACKEND:ATTACHMENT:EDIT` |

Seed 預設建立一個角色（`roleCode: SUPERADMIN`，`isDefault: true`）並指派所有權限。

**JWT Payload 設計**：只存 `sub`（memberId）與 `type`（`access` / `refresh`）。每次請求由 `JwtAuthGuard` 以 `sub` 從 Redis 快取或 DB 載入使用者完整資訊（含 email、roleName、permissions），附加至 `request.member`。

**快取 TTL**：取 `min(JWT 剩餘效期, PERMISSION_CACHE_TTL)`，確保 Token 過期後快取同步失效。

**Redis 是硬相依，不是選填**：`JwtAuthGuard` 在最前面就查 token 黑名單，而黑名單採
**fail-closed**——無法查詢就無法確認 token 是否已被撤銷，一律回 `503`。因此 Redis 掛掉時
**所有已認證請求都會失敗**，public 路由則因節流也是 fail-closed 而回 `429`。

會降級查 DB 的只有 `MemberContext` **快取未命中**的情況，那是 Redis 正常時的路徑；
Redis 本身不可用時根本走不到那裡。要改成可用性優先，節流有 `THROTTLE_FAIL_OPEN` 開關，
黑名單則刻意沒有——那等於允許已撤銷的 token 通行。

#### Guard 用法

```typescript
// 只需登入
@UseGuards(JwtAuthGuard)

// 需要特定 Role
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)

// 需要特定 Permission
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions(PermissionCode.BACKEND_ACCOUNT_EDIT)
```

#### 取得當前使用者

```typescript
@Get('me')
@UseGuards(JwtAuthGuard)
getMe(@CurrentMember() member: MemberContext) {
  // member.sub / member.email / member.roleName / member.permissions
}
```

`MemberContext` 定義於 `apps/api/src/adapter/in/web/decorator/current-member.decorator.ts`，欄位為 `sub`（memberId）、`email`、`roleName`、`permissions`、`status`、`lastPasswordChange`。

### 反向代理與 `request.ip`

Express 預設不採信 `X-Forwarded-For`，部署在 LB / 反向代理後 `request.ip` 會變成 proxy 的內網 IP，導致 **IP 黑名單失效、白名單誤判、登入失敗封鎖失準**。

以 env `TRUST_PROXY` 控制（預設 `'loopback'` = 不採信外部 XFF）。部署時依拓樸改為信任跳數（如 `'1'`）或具體 CIDR；**切勿設 `true`** —— 會無條件採信偽造的 XFF。封鎖類 Guard（IP 黑名單）取不到 IP 時應 **fail-closed**（拒絕）而非放行。

### 全域中介層

以下 Provider 在 `apps/api/src/app.module.ts` 全域註冊，**所有端點自動套用，無需手動加裝飾器**：

| Provider          | 類別                    | 作用                                                                                                   |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `APP_GUARD`       | `ThrottlerGuard`        | 速率限制（Redis 滑動視窗）；全域預設由 env 配置，各端點可用 `@Throttle()` 覆蓋；Redis 不可用時**預設拒絕請求**（回 429），可用 `THROTTLE_FAIL_OPEN=true` 改為放行 |
| `APP_GUARD`       | `IpBlacklistGuard`      | IP 黑名單檢查（FeatureFlag 控制，關閉時跳過）                                                          |
| `APP_GUARD`       | `IpWhitelistGuard`      | IP 白名單檢查（FeatureFlag 控制，關閉時跳過）                                                          |
| `APP_GUARD`       | `SessionIdleGuard`      | 閒置登出檢查（FeatureFlag 控制，關閉時跳過）                                                           |
| `APP_FILTER`      | `GlobalExceptionFilter` | 統一例外格式，並寫入 System Log                                                                        |
| `APP_INTERCEPTOR` | `LoggingInterceptor`    | 成功請求寫入 System Log（FeatureFlag 控制，fire-and-forget）                                           |
| `APP_INTERCEPTOR` | `TransformInterceptor`  | 成功回應包裝為 `{ success, data, timestamp }`                                                          |

### API 回應格式

**成功回應**：

```json
{ "success": true, "data": { ... }, "timestamp": "2026-04-05T06:00:00.000Z" }
```

**錯誤回應**：

```json
{ "success": false, "message": "帳號或密碼錯誤", "code": "UNAUTHORIZED", "timestamp": "..." }
```

`code` 有**兩個來源**，不要混淆：

| 例外種類 | code 來源 | 範例 |
| --- | --- | --- |
| `DomainException` 子類（業務錯誤） | 自帶的 `ResponseCodes` 常數 | `MEMBER_NOT_FOUND`、`ROLE_HAS_MEMBERS` |
| NestJS `HttpException`（框架層） | class name 轉 SCREAMING_SNAKE_CASE | `UnauthorizedException` → `UNAUTHORIZED` |
| 未預期錯誤 | 固定 `INTERNAL_SERVER_ERROR` + 通用訊息（不洩漏內部細節） | — |

前端 `@app/api-client` 的 hooks 會自動 unwrap `data` 外殼。

#### 錯誤碼與訊息

兩份單一真相，**分開放**：

- `shared/constants/response-codes.ts` —— 錯誤碼常數
- `shared/constants/response-messages.ts` —— 對外訊息，以 `satisfies Record<ResponseCode, ...>` 約束

訊息表的值為字串者是「靜態訊息」，為函式者是「動態訊息」。`DomainException` 以建構子重載分流：

```typescript
// 靜態訊息：基底自訊息表取，不必也不得傳文案
super(ResponseCodes.ACCOUNT_DISABLED, 'FORBIDDEN');

// 動態訊息：型別強制必須傳入算好的訊息
super(ResponseCodes.ROLE_HAS_MEMBERS, 'CONFLICT', ResponseMessages.ROLE_HAS_MEMBERS(count));
```

**新增一個錯誤碼的完整步驟**：

1. `response-codes.ts` 加 code —— 此時 `pnpm typecheck` 會**立刻失敗**，要求補訊息（`Record<ResponseCode, ...>` 的完整性保證）
2. `response-messages.ts` 補訊息（不需參數就寫字串，需要參數就寫函式）
3. 建立 exception 子類，選一個既有的 `DomainExceptionKind`
4. `GlobalExceptionFilter` **不需要修改**（kind 自動映射 HTTP status）

架構測試 `no-inline-message.spec.ts` 會擋下「把文案寫回 exception」的退步寫法。

#### domain 驗證：`of()` 與 `trusted()`

value object 有兩條建立路徑，用途不同、**不要混用**：

| 方法 | 用途 | 驗證失敗 |
| --- | --- | --- |
| `Email.of()` / `MemberId.of()` | 驗證使用者輸入 | 拋 `INVALID` domain exception → **400** |
| `Email.trusted()` / `MemberId.trusted()` | 從 DB 還原（`reconstitute`） | 不驗證 |

還原路徑刻意不重跑驗證：DB 的值在寫入時已驗證過，此時再驗一次，「資料損毀」會被回報成 400（客戶端輸入錯誤），但客戶端其實什麼都沒做錯。

### 功能開關（Feature Flags）

所有安全功能皆受 `FeatureFlagService` 控制，透過環境變數開關，**預設全部關閉**（除 `APPLICATION_ADMIN_ROLE_ENABLED`）。

```typescript
constructor(private readonly featureFlags: FeatureFlagService) {}
if (this.featureFlags.isEnabled('accountLockEnabled')) { ... }
```

| Flag 名稱                | 環境變數                               | 控制範圍                                         |
| ------------------------ | -------------------------------------- | ------------------------------------------------ |
| `adminRoleEnabled`       | `APPLICATION_ADMIN_ROLE_ENABLED`       | `RolesGuard` 角色檢查                            |
| `authLogEnabled`         | `APPLICATION_AUTH_LOG_ENABLED`         | 登入/登出/密碼重設日誌寫入 `auth_logs`           |
| `ipWhitelistEnabled`     | `APPLICATION_IP_WHITELIST_ENABLED`     | `IpWhitelistGuard` 全域白名單                    |
| `ipBlacklistEnabled`     | `APPLICATION_IP_BLACKLIST_ENABLED`     | `IpBlacklistGuard` 全域黑名單 + 登入失敗自動封鎖 |
| `accountLockEnabled`     | `APPLICATION_ACCOUNT_LOCK_ENABLED`     | 登入失敗計數 + 帳號鎖定                          |
| `passwordChangeEnabled`  | `APPLICATION_PASSWORD_CHANGE_ENABLED`  | `JwtAuthGuard` 密碼過期檢查                      |
| `sessionIdleEnabled`     | `APPLICATION_SESSION_IDLE_ENABLED`     | `SessionIdleGuard` 閒置登出                      |
| `googleRecaptchaEnabled` | `APPLICATION_GOOGLE_RECAPTCHA_ENABLED` | 登入時 reCAPTCHA 驗證                            |
| `apiLogEnabled`          | `APPLICATION_API_LOG_ENABLED`          | `LoggingInterceptor` System Log 寫入             |
| `operationLogEnabled`    | `APPLICATION_OPERATION_LOG_ENABLED`    | 操作日誌                                         |

### 安全功能細節

- **帳號鎖定**：連續登入失敗達 `APPLICATION_ACCOUNT_LOCK_THRESHOLD` 次後，帳號自動鎖定（DB `lockedAt` 欄位）。失敗計數使用 Redis INCR（30 分鐘 TTL），Redis 不可用時 graceful degradation（不計數，但 DB 鎖定仍有效）。登入成功自動重置計數。

  **鎖定有時效**（`APPLICATION_ACCOUNT_LOCK_DURATION_MIN`，預設 15 分鐘），逾時自動解除。
  沒有時效的版本是一個**沒有復原路徑的死結**：鎖定的檢查排在密碼驗證之前，
  被鎖的帳號連「密碼打對」都到不了清除計數那條路；而人工解鎖的端點需要一個
  已登入且具 SUPERADMIN 的管理員——把已知的管理員 email 全鎖一輪就沒有人能登入解鎖，
  而觸發鎖定完全不需要認證、也不需要猜對密碼。

  **到期時必須一併清除失敗計數**（`LoginService` 收到 `EXPIRED` 時呼叫 `resetFailedLogin`）。
  Redis 計數的 TTL（30 分鐘）比時效長，不清的話使用者在到期後第一次打錯就會
  因為「計數還在閾值上」立刻重新被鎖，實際鎖定時間變成計數的 TTL 而非設定的時效——
  而設定的那個數字看起來完全正常。`AccountLockPort.checkLock()` 因此回三態
  （`NONE` / `LOCKED` / `EXPIRED`）而非布林：布林分不出「從未鎖定」與「鎖過但已到期」。

  時效**不解決**「持續攻擊者可以每 N 分鐘重鎖一次」，那是 per-IP 限制的職責
  （`APPLICATION_IP_BLOCK_THRESHOLD`）。它解決的是「永久且無復原路徑」。

- **API 文件的暴露**：Swagger UI 與 OpenAPI spec 由 `SWAGGER_ENABLED` 控制，
  **未設定時依 `NODE_ENV`**（production 關、其餘開）。關閉時 `/docs` 與 `/docs-json`
  兩者都不掛載——`docs-json` 才是有價值的那份，而它沒有介面所以容易被漏掉。
  這兩條路徑用 `app.use()` 掛原生 Express middleware，**全域 `JwtAuthGuard` 碰不到**
  （Nest 的 guard 只作用於 Nest 路由）；`public-surface.spec.ts` 要求所有
  `app.use()` 掛載都列入豁免清單並註明理由。

- **免認證路徑必須精確比對**：`JwtAuthGuard` 對 `/api/metrics` 的豁免用的是
  精確比對（去除 query string 後）而非 `startsWith`。前綴豁免的性質是
  「未來新增的任何同前綴路由自動免認證」，而那不會有任何錯誤訊息提醒你。
- **IP 黑白名單**：`IpBlacklistGuard` / `IpWhitelistGuard` 全域攔截。IP 連續登入失敗達 `APPLICATION_IP_BLOCK_THRESHOLD` 次自動加入黑名單。資料表：`ip_whitelist`、`ip_blacklist`（後者含 `isAutoBlock` 標記）。
- **密碼策略**：`PasswordPolicyService` 依角色套用不同複雜度（**0–4**，累加式）：0 只檢查長度、1 加英文字母與數字、2 加大小寫各一、3 加特殊符號、4 加禁止 18 組常見弱密碼。**系統管理員預設 4、其他角色預設 1**（`APPLICATION_SYSTEM_ADMIN_PASSWORD_COMPLEXITY` / `APPLICATION_OTHER_ADMIN_PASSWORD_COMPLEXITY`）。
- **密碼定期更換**：`passwordChangeEnabled` + `APPLICATION_PASSWORD_CHANGE_PERIOD > 0` 時，`JwtAuthGuard` 檢查 `lastPasswordChange`；超期回 `403 { code: 'PASSWORD_CHANGE_REQUIRED' }`。
- **閒置自動登出**：`SessionIdleGuard` 用 Redis TTL；每次認證請求刷新 TTL，超過 `APPLICATION_SESSION_IDLE_TIMEOUT` 分鐘未活動 key 自動消失，回 `401`。Redis 不可用時視為活躍。
- **Google reCAPTCHA**：`GoogleRecaptchaAdapter` 支援 v2 / v3。非正式環境（`GOOGLE_RECAPTCHA_IS_PRODUCTION=false`）永遠通過；v3 需通過 0.5 分數門檻。啟用時登入必須附帶 `recaptchaToken`。
- **登入日誌**：`LOGIN_SUCCESS` / `LOGIN_FAILURE` / `LOGOUT` / `PASSWORD_RESET` 寫入 `auth_logs`（含 IP / UA / detail）。fire-and-forget，不影響主流程。
- **密碼重設**：`POST /api/admin/auth/forgot-password` 不論 email 是否存在皆回 `204`（防列舉），token 存 `password_reset_tokens` 表；`POST /api/admin/auth/reset-password` 驗證 → 策略檢查 → 更新 → 條件式強制登出。

  防列舉是**全鏈路**的，不只狀態碼：帳號不存在時靜默 return 且**刻意不把 email 寫進 log**
  （否則日誌會累積「哪些信箱未註冊」的列舉來源）；寄信失敗包 try/catch 不拋出；
  **寄信不 await**——SMTP 設定了卻連不上會走滿 `connectionTimeout`（預設 10 秒），
  讓「帳號存在」的回應慢兩個數量級，那是比狀態碼更明顯的訊號。另有每分鐘 3 次的節流。

  **已知取捨——重設 token 走 query string**（`APP_PASSWORD_RESET_URL?token=…`）：
  query string 會進入瀏覽器歷史、`Referer` 標頭（該頁若載入第三方資源就會外送），
  以及反向代理 / CDN 的存取日誌。專案自己的日誌已處理（`sanitizeUrl` 的
  `SENSITIVE_QUERY_PARAMS` 含 `token`），風險只在專案控制範圍外的設施。
  未設 `APP_PASSWORD_RESET_URL` 時的 fallback 用的是 `#token=`（fragment），
  fragment 不會送到伺服器也不進 `Referer`——**安全性反而優於主要分支**。
  要收斂有兩條路：前端載入後立刻 `history.replaceState` 移除 token（成本最低），
  或統一改用 fragment。改動會影響前端路由，目前維持現狀。

### 後台檢舉審閱的權限

| 權限碼 | 涵蓋的端點 |
| --- | --- |
| `BACKEND:MODERATION:VIEW` | 檢舉佇列、檢舉詳情、成員行為時間軸 |
| `BACKEND:MODERATION:EDIT` | 檢舉的狀態流轉（判定 / 駁回） |

**兩者刻意分開**，理由與附件（上傳與刪除共用一個碼）相反：這裡兩個動作的風險不同——
查看會接觸到敏感內容（**含被撤回的訊息快照**），判定會改變狀態。
「能看的人」與「能判的人」在真實團隊裡經常不是同一群：
客服看得到、只有主管判得了，是常見的配置。

**查看檢舉詳情會寫入一筆 `REPORT_VIEWED` 稽核**（列表不會——它不含內容快照）。
那是特權路徑的對價：這是唯一能看到被撤回訊息內容的地方，
查看不留痕跡的話，它與「任何人都看得到」在事後沒有實質區別。

### 兩套獨立的帳號體系

專案有**兩張互不相關的帳號表**，不是一張表加側別欄位：

| | 後台 `members` | 前台 `users` |
| --- | --- | --- |
| 登入 | `/api/admin/auth/login` | `/api/front/auth/login` |
| 簽發 secret | `ACCESS_SECRET` / `REFRESH_SECRET` | `FRONT_ACCESS_SECRET` / `FRONT_REFRESH_SECRET` |
| 上下文型別 | `MemberContext`（含角色與權限碼） | `UserContext`（沒有這些概念） |
| Guard | 全域 `JwtAuthGuard` | `FrontJwtAuthGuard`（`@UseGuards` 掛在需要認證的 controller） |
| 帳號鎖定 | 有（`lockedAt` + 時效） | **沒有**——per-account 鎖定是未認證者可觸發的 DoS 面 |
| 共用 | token 黑名單（以 token 為鍵，與側別無關） | 同左 |

**token 的側別有三道防線**，任何一道單獨都擋得住：

1. **各自的簽發 secret**——跨側的 token 連簽章都驗不過。這是刻意的選擇：
   共用 secret 時「某處忘了比對 side」的後果是**跨側存取**，
   各自一組時是**簽章驗證失敗**（fail-closed）。
2. **`side` claim 比對**（`'admin' | 'front'`）。作用是讓錯誤訊息說得出
   「這是另一側的 token」而不是只有「簽章無效」。
3. **兩張表的 ID 空間不相交**——前台使用者的 id 在 `members` 裡查不到。
   這是分表的附帶效果，也是它比「一張表加側別欄位」更安全的最深理由。

因為 (1) 與 (3) 都會擋，**e2e 的「跨側 token → 401」驗的是結果而非機制**；
機制由 `ResolveMemberContextService.spec.ts` 的單元測試釘住。

**`side` 缺席的相容措施是有時效的**：本機制上線前簽出的後台 token 沒有這個欄位，
一律拒絕會讓部署當下所有人被登出，因此「缺少 `side`」視為 `admin`。
部署時間超過 refresh token 效期（預設 7 天）之後，所有流通中的 token 都會帶 `side`，
屆時可把 `?? 'admin'` 改成 `!== 'admin'`。前台不需要這個相容——前台 secret 是新的。

**聊天的參與者一律是前台使用者。** `/api/front/chat-*` 三支 controller
掛的是 `FrontJwtAuthGuard`，WS 連線走 `ResolveUserContextUseCase`——
兩者都只吃前台 token。後台 token 打進來會 401 / 連線被拒，
而且不是因為權限不足，是簽章根本驗不過。

前台受保護的 controller 必須**同時**標 `@Public()` 與掛 `@UseGuards(FrontJwtAuthGuard)`：
前者是給全域的後台 Guard 看的（讓它略過），後者才是真正的認證。
只有前者的話兩個 Guard 都放行，端點完全沒有認證；只有後者的話全域 Guard 先跑，
有效的前台 token 一律 401。`authorization-coverage.spec.ts` 兩邊都守著。

### 在線人數的衍生索引

presence 的**真相**是 `presence:member:<id>` 的 Hash（每筆連線帶心跳時間、
由 TTL 與 sweep 回收）。⚠️ key 裡的 `member` 指的是**前台使用者**——
WS 只服務前台。格式沒有改成 `presence:user:` 是因為要連帶改 sweep 的 scan pattern、
在線索引與所有測試，換來的只是命名更精確；這是一筆有標記的命名債。在它之上另有一個 `presence:online-members` 的 Set，
用途只有一個：讓「在線人數」變成 O(1) 的 `SCARD`。

**這不牴觸「不得用無時效集合儲存連線」那條規則**——被禁止的是把連線本身存成集合
（實例被 kill 時無法自動恢復），而這裡任何**在線與否的判斷**讀的仍然是 Hash。
判準是「索引壞掉時系統會不會給出錯的狀態」：不會，只會讓統計數字暫時不準。

維護方式：
- `markOnline` / `markOffline` 只在**狀態真正轉換**時動它（那兩個布林本來就已經回傳）
- **`heartbeat` 不動它**——心跳是頻率最高的操作，每次多一個往返會累積
- `sweepStale` 的既有遍歷順手以**差集**校正（多的 `SREM`、少的 `SADD`）。
  需要校正是因為實例被強制終止時 `markOffline` 不會執行，索引會單向累積漂移

**校正不得整份重建**：`DEL` 之後重建有一個窗口讓 `SCARD` 讀到 0，
那個瞬間儀表板會顯示「線上 0 人」——一個看起來像故障的正確操作。

這個數字**只能用於統計**：它有最多一個 sweep 週期的校正延遲。
需要精確判斷的地方用 `isOnline()`，它讀的是連線紀錄。
`presence-scan.spec.ts` 守著「掃描 pattern 只能在週期性清理中使用」，
判定以**方法**為單位——presence 的 adapter 同時有清理與查詢兩種方法。

### 營運總覽的 SSE

`GET /api/admin/moderation/dashboard/stream` 是專案唯一的 SSE 端點，三個決定值得記住：

- **定時快照而非事件驅動**：伺服器每 `DASHBOARD_STREAM_INTERVAL_SEC` 秒查一次推出去。
  事件驅動要在每一則訊息、每一次連線上多做一份廣播——那是把儀表板的成本
  加到**聊天的熱路徑**上。儀表板看的是聚合數字，晚 5 秒沒有差別。
- **一個實例只跑一個計時器**（`DashboardStream`）：實例上有 1 個或 10 個管理員在看，
  資料庫的查詢次數都一樣。寫成「每個連線各自 `setInterval`」會讓管理員人數
  直接乘上資料庫負載，而那種放大在開發時看不出來。沒有訂閱者時停掉計時器。
- **前端不能用 `EventSource`**：它無法帶自訂 header，而本專案以
  `Authorization: Bearer` 認證。把 token 放 query string 是明文禁止的
  （會進日誌、瀏覽器歷史與 `Referer`），所以只剩 `fetch` +
  `response.body.getReader()` 這條路——重連要自己寫，且必須有退避。

**中斷時畫面必須標示數字已過期。** 一個安靜顯示 20 分鐘前數字的儀表板
比沒有儀表板更糟：它讓人以為自己知道現況，而營運會依它做判斷。

### 兩道限流的分工

WebSocket 有**兩道各自獨立的限流**，它們看起來重複，實際上防的是不同的東西。
最容易發生的錯誤是有人判斷它們重複而移除其一——而被移除的通常是業務層那道，
因為連線層看起來更「底層」、更像基礎設施。

| | 連線層（`ConnectionThrottle`） | 送訊息（`MessageRateLimitPort`） |
| --- | --- | --- |
| 保護什麼 | 這個行程的事件迴圈 | 房間不被洗版 |
| 計數單位 | **單一連線**（socket id） | **成員 + 房間**（跨連線、跨實例） |
| 計數放哪 | 本實例記憶體 | Redis |
| 涵蓋範圍 | 所有 `@SubscribeMessage` 事件，含 `ping` | 只有送訊息 |
| 開 N 條連線 | 額度 × N | 額度不變 |
| 錯誤碼 | `WS_RATE_LIMITED` | `CHAT_MESSAGE_RATE_LIMITED` |
| 閾值 | `WS_CONNECTION_EVENT_LIMIT` / `_WINDOW_SEC` | `WS_MESSAGE_RATE_LIMIT` / `_WINDOW_SEC` |

**連線層取代不了業務層**：開 10 條連線就能繞過前者，後者不受影響。
**業務層也取代不了連線層**：`ping` 與 `syncRoom` 完全不經過它。
`ws-rate-limit.spec.ts` 會擋下以「連線層已有限流」為由申請的豁免。

連線層的計數刻意**不走 Redis**：一條連線只存在於一個實例上，跨實例一致性沒有意義，
而每個事件多一次網路往返會讓限流本身變成它要防的那種負載。
代價是重啟後計數歸零、多開連線有多倍額度——兩者都可接受，
因為這道防線的目標不是擋住蓄意攻擊者（他可以開更多連線），
而是**讓失控的客戶端無法拖垮實例**。

超過門檻時**丟棄該事件並回 `server:error`，不斷線**：誤判的代價不對稱，
把人踢下線會讓暫時性的異常變成使用者可見的故障，而客戶端還會自動重連造成更多負載。

### 認證狀態變更與既有連線

**連線層的認證只在 handshake 執行一次。** 之後的 WS 事件只驗資源層級的授權
（例如房間成員資格），不會重新解析身分——因此**改變帳號狀態不會影響既有的連線**。

這曾經是一個實際的漏洞：帳號停用後，被停權的人只要連線還開著就能繼續送訊息。
缺口的形狀值得記住——**每一層都正確，但沒有人負責銜接**。

因此：**任何把帳號停用的路徑都必須呼叫 `REVOKE_MEMBER_SESSIONS_USE_CASE`**，
它會先送 `server:sessionRevoked`（讓客戶端知道不要重連）再斷開連線。

**停權有兩個入口，停的是兩張不同的表**：

| 入口 | 對象 | use case |
| --- | --- | --- |
| `POST /admin/moderation/members/:id/suspend` | 前台使用者（`users`） | `SUSPEND_FRONT_USER_USE_CASE` |
| `PATCH /admin/members/:id { status: false }` | 後台管理員（`members`） | `UPDATE_MEMBER_USE_CASE` |

**不共用一支再加側別參數**：那會讓每個呼叫端都要記得傳對，而傳錯的後果是
停錯人且沒有任何錯誤訊息。拆開之後對象由「呼叫哪一支」決定，型別上就不可能停錯。
審閱側**沒有**「不可停權自己」的檢查——管理員的 ID 在 `users` 裡查不到，
傳進來只會得到 404。

撤銷連線本身**不分側別**：它只做「對個人房間廣播再斷線」，不查任何帳號表。
複製一份「前台版」換來的只是兩份會各自漂移的相同程式碼。
`session-revocation.spec.ts` 守著這件事——日後多一條停用路徑（批次停用、
自動風控、匯入工具），它同樣會被要求撤銷連線。

撤銷是跨實例的：`disconnectSockets()` 與 `fetchSockets()` 一樣是 adapter 感知的，
配上 `@socket.io/redis-adapter` 就會作用到所有實例的連線。

**順序不可顛倒**：先送事件、再斷線。斷線後就沒有管道可以說明原因了，
而 Socket.IO 客戶端預設會自動重連——沒有那個事件，被停權者會進入無盡的重連迴圈，
使用者看到的是「一直在連線中」而不是「你的帳號已停用」。
