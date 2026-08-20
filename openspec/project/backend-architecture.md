# 後端架構與慣例

> 六角分層、目錄結構、後端慣例、命名規範、時間處理、Swagger yaml 撰寫慣例。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

## 後端架構：六角（Ports & Adapters）

```
apps/api/src/
├── adapter/
│   ├── in/web/
│   │   ├── admin/     # 後台 Controller + DTO（per-module；路由 /api/admin/<names>）
│   │   ├── front/     # 前台 Controller + DTO（公開；路由 /api/front/<names>）
│   │   └── {guard,filter,interceptor,decorator}/  # 共用橫切（與 admin/front 平級）
│   └── out/           # Prisma、Redis、Firebase、Mail、S3 等實作（共用，不分前後台）
├── application/
│   ├── facade/{admin,front}/     # 每個 domain area 一個 *Facade，分前後台
│   ├── port/
│   │   ├── in/{admin,front}/{module}/   # Use case 介面，分前後台
│   │   └── out/{module}/                # Repository / 外部服務介面（共用）
│   └── service/{admin,front,shared}/    # Use case 實作（shared = 跨前後台共用）
├── domain/
│   ├── model/         # 領域實體（private constructor + static factory）（共用）
│   ├── value-object/  # 值物件（共用）
│   └── exception/     # 領域例外（DomainException 子類，訊息取自 response-messages）（共用）
├── infrastructure/    # PrismaModule / PrismaService、Redis、ZodValidationPipe、Logger
└── modules/{admin,front}/   # NestJS DI 接線（中性 infra module 留在 modules/ 根）
```

**依賴方向**：`adapter/in` → `application` → `port/out` ← `adapter/out`。`application` 與 `domain` 層**從不**引入 `adapter`。

**前後台分層**：專案有兩套 API —— 後台（admin，管理端，`/api/admin/*`）與前台（front，公開端，`/api/front/*`）。切分只發生在 **in 側 5 層**（controller / facade / service / port-in / module → 各自進 `admin/` 或 `front/`）；**out 側**（port-out / persistence）、**domain**（model / value-object / exception）、以及 **in 側橫切**（guard / filter / interceptor / decorator）一律**共用、不分前後台**，照 domain 分類放各層根目錄。中性 infra module（health / redis / jwt / email…）留在 `modules/` 根。前台 module 類名加 `Front` 前綴避免與後台同名撞名。**新模組一律用 `gen:module <name> [--admin|--front]` 產生（預設 admin），不要手刻。** Swagger 亦分兩份：後台 `/api/admin/docs`（yaml 在 `docs/swagger/admin/`，餵 `packages/api-client` 給 `apps/web`）、前台 `/api/front/docs`（`docs/swagger/front/`）。health 為中性 ops 端點，不入任一份 client 契約。

### 後端慣例

- **Module naming（依 `<side>` = `admin` / `front` 分層）**：in 側依側別分目錄——Controller + DTO → `adapter/in/web/<side>/<module>/`；service → `application/service/<side>/<module>/`（跨前後台共用 service 放 `application/service/shared/`）；facade → `application/facade/<side>/`；port-in → `application/port/in/<side>/<module>/`；module → `modules/<side>/<module>.module.ts`。**共用層不分前後台**：Prisma repository → `adapter/out/persistence/<module>/`、port-out → `application/port/out/<module>/`、domain → `domain/`；Guard / Filter / Decorator / Interceptor 放各自頂層目錄。
- **Facade**：每個 domain area 對外只暴露 `*Facade`（如 `AuthFacade`、`MemberFacade`），Controller 透過 facade 操作，不直接打 service。
- **Domain exception → HTTP**：domain exception 一律 `extends DomainException`（建構子傳 `ResponseCodes` 的 code + 語意 `kind`）；`GlobalExceptionFilter` 以一張 `kind → HttpStatus` 表自動映射，**新增 exception 不用改 filter**；但要動**兩個**檔案——`response-codes.ts` 加 code、`response-messages.ts` 加訊息（訊息表以 `satisfies Record<ResponseCode, …>` 約束，少一條就 typecheck 失敗）。訊息不需參數時 exception 只寫 `super(code, kind)`，基底自表中取。kind 可選 `NOT_FOUND / UNAUTHORIZED / FORBIDDEN / INVALID / CONFLICT / LOCKED / INTERNAL`。
- **Guard 順序**：`app.module.ts` 內 `APP_GUARD` 的宣告順序 = 執行順序：ThrottlerGuard → IpBlacklistGuard → IpWhitelistGuard → SessionIdleGuard → JwtAuthGuard → PermissionsGuard。
- **Controller 回傳**：原始值即可，`TransformInterceptor` 會包成 `{ success, data, timestamp }`；**不要**自行包 `{ data }`，否則前端要挖兩層。
- **時區 / 日期**：見下方「時間處理慣例」。
- **Repository P2002**：Prisma `unique constraint violation` 在 Repository 層 try/catch 轉成 domain exception，service 層不感知 Prisma。

### Path alias（`@app/*`）

`@app/*` 對應 `apps/api/src/*`。**4 層以上的相對路徑一律改用 alias**，
由 eslint 的基礎 `no-restricted-imports` 擋（門檻 `../../../../`）。

門檻設在 4 層而非全面 alias 化：2～3 層多半是同模組內的鄰近檔案，
相對路徑反而更能表達「就在隔壁」；4 層以上已經跨越分層邊界，看不出指向哪裡。

四條解析路徑各自要設定，缺一就是那條路徑靜默失效：

| 路徑 | 機制 |
| --- | --- |
| `tsc --noEmit` | `tsconfig.json` 的 `baseUrl` + `paths` |
| `nest build` → `dist/` | **原生支援**，@nestjs/cli 的 tsc builder 編譯時改寫成相對路徑，`dist/` 內不留 `@app/` |
| ts-jest（單元 / e2e / 守則） | 三份 jest 設定各自的 `moduleNameMapper`。注意 `<rootDir>` 不同：單元測試是 `src`，e2e 與守則是 `apps/api`（要補 `src/`） |
| ts-node（9 支 script） | `-r tsconfig-paths/register` |

**不需要 `tsc-alias`，也不需要換 SWC。** 這點與早期評估相反——曾因「`nest build` 不改寫 alias、
`tsc-alias -w` 與 `nest start --watch` 兩個 watch 賽跑」而延後導入，實測 @nestjs/cli 11
編譯時就會改寫，`node dist/main` 可完整啟動，那個賽跑問題根本不存在。

改用 alias **不影響架構守則**：`layering` 比對 `prisma.service` / `Repository$` 等子字串、
`side-isolation` 比對路徑是否含 `/admin/` `/front/`，這些片段在 `@app/` 形式下都還在
（已用探針逐一驗證變紅）。

### 命名規範

| 對象                  | 慣例                 | 範例                                          |
| --------------------- | -------------------- | --------------------------------------------- |
| API JSON 欄位         | camelCase            | `permissionCodes`、`createdAt`                |
| TS 變數 / 函式        | camelCase            | `roleFacade`、`listRoles`                     |
| Class                 | PascalCase           | `RoleController`、`CreateRoleService`         |
| Zod schema            | `<camel>Schema`      | `createRoleSchema`、`listRolesQuerySchema`    |
| Zod 推導型別 / DTO    | PascalCase           | `CreateRoleRequest`、`ListRolesQuery`         |
| DI token / port 常數  | SCREAMING_SNAKE_CASE | `CREATE_ROLE_USE_CASE`、`ROLE_REPOSITORY_PORT`|
| 錯誤 code             | SCREAMING_SNAKE_CASE | `ROLE_NOT_FOUND`                              |
| 檔名（class）         | PascalCase           | `RoleController.ts`、`CreateRoleUseCase.ts`   |
| 檔名（infra / module）| kebab-case           | `zod-validation.pipe.ts`、`role.module.ts`    |
| 資料夾                | kebab-case           | `adapter/in/web/role`、`application/service/role` |

### 時間處理慣例

**單一原則：UI 一律本地時區（`APP_TIMEZONE`）、DB 儲存與後端運算 / 比較一律 UTC instant、轉換只在後端邊界做。**

- **DB & 運算**：`DateTime` 欄位存 **UTC instant**（`new Date()`；Prisma driver 層 `timezone: 'Z'` 已強制 UTC 寫入 / 讀回）。日期比較（如「開始日是否為未來」）一律用 instant——`start.getTime() > Date.now()`，**不要**用 `YYYY-MM-DD` 字串比大小（會受時區位移錯一天）。
- **API 契約**：日曆日輸入 / 輸出用 **`APP_TIMEZONE` 日曆日的 `YYYY-MM-DD` 字串**（Zod `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`，**不要** `z.coerce.date()`——它把字串當 UTC 午夜 parse，跨時區會錯一天）；read-model 的時間欄位回 UTC `Date`，前端負責格式化為本地。
- **日邊界轉換（只在後端邊界做）**：`APP_TIMEZONE` 日曆日 → UTC instant 用 dayjs tz——開始日 `dayjs.tz(day, tz).startOf('day').toDate()`、結束日 `dayjs.tz(day, tz).endOf('day').toDate()`。首個用到「日區間查詢」的功能把它抽成 `date.ts` 的 `appDayStartUtc` / `appDayEndUtc` / `rangeToUtc`（+ spec）供之後共用。
- **禁止**：`new Date(d).toISOString().slice(0, 10)` 當「本地日」顯示（那是 UTC 日、會錯一天）；後端直接把前端傳的 `YYYY-MM-DD` 用 `new Date()` 當本地日存（跨環境系統時區不定）。

### Swagger yaml 慣例

- **分檔 + `$ref`**：`docs/swagger/openapi.yaml` 只放 `components` / `servers` / `info` 與 `paths` 索引；每個 endpoint 一個獨立 yaml。
- **成功回應自己 inline 寫**：**不要** `$ref: SuccessResponse`。每個 endpoint 在 200 / 201 直接 inline 寫整個 `{ success, data: <具體 shape>, timestamp }`。原因：`SuccessResponse.data` 是 generic `type: object`，前端 `openapi-typescript` 推導出來只會是 `Record<string, unknown> | null`，型別失去意義。範例見 `apps/api/docs/swagger/admin/auth/login.yaml`、`admin/profile/get-me.yaml`。
- **新增 endpoint 後**：執行 `pnpm --filter @app/api swagger:bundle` 重新打包 bundle；前端執行 `pnpm --filter @app/api-client generate` 同步型別。

#### 契約同步護欄

API 契約要經過三段轉換才到前端，**只有最後一段受 TypeScript 保護**：

```
Controller 路由 → docs/swagger/*/[模組].yaml → openapi.bundle.yaml → api-client/schema.ts → 前端
              └─ 人工同步 ─┘  └ swagger:bundle ┘   └ generate ┘      └─ TS ─┘
```

前三段任一環節漏掉都是**靜默不同步**，因此有兩層檢查（分工判準是速度）：

| 檢查 | 指令 | 成本 | 抓得到 |
| --- | --- | --- | --- |
| 路由集合 | 跟著 `pnpm test` 自動跑 | 毫秒 | 新增 / 刪除 endpoint 沒同步 |
| 成功狀態碼 | 跟著 `pnpm test` 自動跑 | 毫秒 | `@HttpCode` 與 yaml 記載的 2xx 不一致 |
| 產物內容 | `pnpm --filter @app/api swagger:check` | 數秒 | 欄位增刪、型別或描述變更 |

- 路由層級由 `test/architecture/swagger-sync.spec.ts` 守住三段轉換，失敗訊息會指出該跑哪個指令。
- **狀態碼那條是補漏加的**：原本只比對「路由存不存在」，於是 `forgot-password` / `reset-password`
  的 yaml 長期寫成 `200` + `data.message`、實作卻是 `204` 無 body，兩邊路由都在、檢查全綠，
  錯的型別一路流到 `@app/api-client`。護欄只驗「存在」不驗「內容」時，內容漂移可以躲很久。
  該規則讀 bundle 而非來源 yaml——來源每條路由都是 `$ref`，`responses` 不在檔內。
- `swagger:check` 把產物產生到 `os.tmpdir()` 再比對，**不會修改工作目錄任何檔案**，可安全用於 CI。
- 刻意不列入 API 文件的端點（如 health 探測）登記在 `test/architecture/allowlist.ts` 的 `SWAGGER_EXEMPT_ROUTES`，同樣受過期檢查約束。
- 比對時 `:id` 與 `{id}` 會正規化，**參數名稱不參與比對** —— `{id}` 與 `{memberId}` 在路由結構上等價，強制同名只會製造無意義的失敗。
