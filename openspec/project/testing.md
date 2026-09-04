# 測試結構與品質門檻

> 單元／e2e／架構守則三層測試的分工、覆蓋率門檻，以及如何新增一條架構守則。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

### 測試結構

```
apps/api/src/
├── domain/{model,value-object}/*.spec.ts
├── application/service/*.spec.ts
└── adapter/in/web/{guard,filter,interceptor}/*.spec.ts

apps/api/test/
├── architecture/          # 架構守則：靜態掃描原始碼，不連 DB / Redis / HTTP
│   ├── helpers.ts         # 收檔、逐行比對、違規報告組裝
│   ├── swagger-helpers.ts # 路由與成功狀態碼的解析
│   ├── allowlist.ts       # 豁免清單（PERMANENT / TEMPORARY，均受過期檢查）
│   └── *.spec.ts          # 各條規則一檔
├── e2e/                   # e2e spec，一個模組一支
│   ├── auth / member / role / security / attachment / front / health
│   ├── ordering.e2e-spec.ts      # 六處 orderBy 的排序保護（fixture 插入順序刻意與期望相反）
│   └── serve-static.e2e-spec.ts  # 單一埠：前端 dist + SPA fallback + /api 不被攔截
├── integration/           # 跨實例／跨行程行為，**用真 Redis**
│   └── ws-cross-instance.integration-spec.ts
├── helpers/               # e2e 與 setup 共用
│   ├── assertions.ts      # 共用斷言 + describeUnauthorized 產生器
│   ├── db.ts              # 測試庫 reset / seed
│   ├── e2e-env.ts         # 讀 .env 並算出測試庫連線
│   └── ws-instance.ts     # 起一個完整 API 實例（含 RedisIoAdapter）+ 簽 token
├── setup/                 # jest lifecycle，不含任何測試
│   ├── test-app.ts        # createE2EApp()（注入真 PrismaService）、createMockRedis()
│   ├── setup-env.ts       # 單元測試的環境變數（由 package.json 的 jest 欄位載入）
│   ├── setup-env.e2e.ts   # e2e 環境變數：DB_DATABASE=*_test、關限流
│   ├── setup-env.integration.ts  # 整合測試環境：**不 mock Redis**、心跳壓到 1 秒
│   └── global-setup.ts    # 守門（僅 *_test 庫）→ 建庫 + migrate deploy + seed baseline
├── jest.arch.config.js    # 架構守則專用設定（rootDir 為 apps/api，不載 setupFiles）
├── jest.e2e.config.js     # e2e 專用設定（globalSetup + setupFiles + maxWorkers 1）
└── jest.integration.config.js  # 整合測試（testTimeout 60s，起多個實例較慢）
```

五個目錄的分工是**有守則擋著的**：`e2e-real-database.spec.ts` 會拒絕放在 `test/e2e/` 以外的
e2e spec。jest 的 `testRegex` 是 `test/.*\.e2e-spec\.ts$`，平鋪一樣跑得到，
沒有守則的話這個結構會靜默侵蝕回原狀。

**整合測試與 e2e 的前置條件相反**：e2e 驗「單一實例內的 API 行為」且 mock Redis；
整合測試驗「多個實例之間」，Redis mock 掉就等於把要驗的東西拿掉——跨實例廣播
完全建立在 Redis pub/sub 之上。兩者混在一起會讓 mock 與真連線在同一個 process 裡打架，
因此分成兩套 jest 設定。

```bash
pnpm --filter @app/api test:integration   # 需要 pnpm docker:deps 起著的 postgres + redis
```

**CI 會執行它**（`integration` job，帶 postgres 與 redis 兩個 service container）。
它的外部相依由 `setup-env.integration.ts` 明示宣告，**不依賴 envSchema 的預設值**
——那樣是靠兩個獨立決定湊巧一致，改動任一方都會以「連不到服務」的形式失敗，
而症狀指不到原因。

整合測試在同一個 Node process 內起多個 NestJS 實例，有兩個因此而來的限制：
`INSTANCE_ID` 必須是 DI provider 而非 module 常數（否則實例共用同一個 ID），
而「關閉 HTTP server」**不等於** `kill -9`——Socket.IO 的 disconnect 照樣觸發、
`handleDisconnect` 照樣清理 presence。要驗證陳舊回收就直接寫入一筆無人續期的紀錄，
別用關閉實例來模擬。

E2E 走**真正的 test 資料庫**（非 mock Prisma），只 mock Redis：

- **專用測試庫**：`test/setup/setup-env.e2e.ts` 把 `DB_DATABASE` 覆寫成 `*_test`（本專案 Prisma 走 object-config `PrismaPg`、非 `DATABASE_URL`，故以資料庫「名稱」隔離）；`createE2EApp` 用**真 `PrismaService`** 連該庫。
- **globalSetup 守門**：目標 DB 名稱不是 `*_test` 就中止（絕不誤 migrate / 清空 dev / prod 庫）；通過才建庫 + `prisma migrate deploy` + seed baseline。腳本內跑 prisma 一律 `pnpm exec`（不用 `npx`，否則噴 pnpm `Unknown env config` warn）。
- **序列執行**：`test:e2e` 用 `--runInBand`（等同 `maxWorkers:1`）——所有 spec 共用同一測試庫，平行會互相 `deleteMany` race（`AUTH_UNAUTHENTICATED` / `P2025` 間歇失敗）。
- **關限流**：`setup-env.ts` 設超大 rate limit env 關掉全域 `APP_GUARD ThrottlerGuard`——序列連跑會跨 spec 累計觸發 429；且 `.overrideGuard(ThrottlerGuard)` 對「經 `APP_GUARD` 註冊的全域 guard」**無效**（NestJS 已知坑），只能走 env。
- **每 spec 自理狀態**：`beforeEach` 用 `helpers/db.ts` reset（`deleteMany` 相關表）+ seed 該 spec 需要的資料。
- Redis 仍以 `createMockRedis()` 注入（本次只把 persistence 拉成真 DB）。

> 為何走真 DB：provider 建構子副作用（如 `S3FileStorage` 於建構子建 client）、env 空字串、adapter 即時計算的欄位等，**只有接真 DI + 真 DB 的 e2e 抓得到**，mock 版看不到。

#### e2e 共用斷言

`test/helpers/assertions.ts`，新增 endpoint 時優先用現成的，不要再手寫 `expect(res.status).toBe(...)`：

| Helper | 用途 |
| --- | --- |
| `expectApiError(res, status, ResponseCodes.X)` | 業務錯誤：同時斷言 status 與 body 的 `code`。code 型別是 `ResponseCode`，錯誤碼改名時 **typecheck 階段**就紅 |
| `expectUnauthorized(res)` / `expectForbidden(res)` | 401 / 403：由 NestJS `HttpException` 產生，code 是 class name 推導的 `UNAUTHORIZED` / `FORBIDDEN`，**不在 `ResponseCodes` 中**，故與業務錯誤分開 |
| `describeUnauthorized(() => app, 'get', '/api/admin/xxx')` | 一行產生「未帶 token → 401」測試。收 app **getter** 而非實例——app 在 `beforeAll` 才建立，describe 收集階段傳實例會拿到 `undefined` |

> 400（Zod 驗證）、429（限流）、未知路由 404 屬框架層、沒有業務 code，維持只斷言 status。

### 測不到的形狀：送到系統外面去的字串

**信件連結、302 導回目標、webhook URL、推播 deep link** 有一個共同特徵：
**它們在系統內部永遠不會被呼叫**。因此任何「呼叫自己」的測試——
e2e 打端點、整合測試連真 DB——都驗不到它們，因為那些測試跑的是
被測 app 自己的 base URL，而錯的正是 base 本身。

實際發生過：驗證信的連結拿 `APP_FRONT_URL`（前台網站根位址）
當後端路由的 base，寄出去的連結指向一個不存在的路徑。
**它通過了當時 687 個測試**——e2e 對 `/api/front/auth/verify-email?token=` 這個
**路徑**發請求，單元測試設了 env 卻沒有斷言組出來的結果。

**修法是直接斷言那個字串**（見 `VerificationMailService.spec.ts`），三行就夠。

**刻意不加守則**：「凡是由 env 組成的對外 URL 都要有斷言」聽起來合理，
但守則沒有辦法知道一個字串是對內還是對外——寫出來是一組正則猜測，
擋不住下一個變形卻會在每次有人組字串時誤報。
**一條會誤報的守則會被繞過，繞過之後它連原本那點價值都沒有。**

判準：**組給外部世界用的字串，要有一支直接斷言它長什麼樣的測試。**

**這一節與下一節「兩種驗證手段的守備範圍」是同一個問題的兩半**：
這裡講的是「值本身錯了」該怎麼擋，下一節講的是它與「兩處不一致」的分工。

### 兩種驗證手段的守備範圍

專案有兩種互補的手段，**守備範圍不重疊**，用錯那一招會擋不到：

| 手段 | 擋得住 | 擋不住 |
| --- | --- | --- |
| **讀原始碼字面值的守則**（正規式掃 constants／裝飾器） | 兩處常數漂移（一邊加了、另一邊沒加）；守衛被移除或註解掉；權限碼移除後遺留的死字串 | **值本身是錯的**（兩邊一致地錯）；守衛還在但語意變了；執行期行為 |
| **直接斷言輸出的測試** | 值本身錯（例如組給外部的 URL 用錯 base） | 兩處常數是否同步；規則有沒有被繞過 |

**判準：錯的是「兩處不一致」還是「值本身」。**
前者用守則（例如 `permission-catalog-sync.spec.ts` 雙向比對
`PERMISSION_CATALOG` 與前端的中文對照），後者只有斷言輸出擋得到
（例如 `VerificationMailService.spec.ts` 直接斷言信件連結長什麼樣）。

這個分界來自實證：三輪審查中「測試綠但沒驗到」出現三次，解法都收斂到守則那一招；
而第二輪最嚴重的問題——驗證信連結拿 `APP_FRONT_URL` 當後端 base——
恰好是守則擋不住的那一類：**兩處一致地錯**，正規式比對得到的是「兩邊相同」。

順帶一個守則自己的陷阱：**字串比對前要先去註解**
（`stripComments`，見 `ws-source.ts`）。把裝飾器註解掉是最典型的「停用但留著」，
而不去註解的正規式會被 `// @Roles(...)` 餵飽，規則於是永遠是綠的。

### 動到模組接線必須跑 e2e

**`pnpm build` 綠不代表 DI 組得起來。** NestJS 的模組圖在**執行期**組裝，
`tsc` 與 `nest build` 都不檢查它。改動 `providers` / `imports` / `exports` 之後，
`pnpm --filter @app/api test:e2e` 是唯一會抓到的那一步。

已經踩過兩次，兩次的共同特徵都是「綠燈的組合看起來像沒事」：

- `@Inject(METRICS_PORT)` 加進 `PrismaAccountLockAdapter`，而 `MetricsModule`
  不是 `@Global()`——打掛 10 支 e2e，而 typecheck / lint / test 全綠。
- `ChatWsModule` 的 `exports` 留著一個它已不再 provide 的 token
  （Nest 不允許 re-export 自己沒有 provide 的東西）——**`pnpm build` 也是綠的**，
  e2e 409 支全紅。

`build` 過了很容易被判斷成可以推上去。寫在這裡，是為了讓下一個人不必用一輪 CI
換這個結論。

### 覆蓋率門檻

門檻只涵蓋**邏輯層**，wiring / 宣告 / 已由 e2e 涵蓋的部分排除在分母外——納入只會稀釋數字，並逼著為 DI 配線寫無意義的測試。

- **後端**（jest）：`coveragePathIgnorePatterns` 排除 `*.module.ts`、`main.ts`、`*Controller.ts`、`*Gateway.ts`、`*Request.ts`、`*Query.ts`、`port/`、`facade/`、`adapter/out/`、`validate-env.ts`；門檻 70/60/70/70。

  `*Gateway.ts` 與 `*Controller.ts` 同一類：in 側的薄進入點，行為由更上層的測試涵蓋
  （controller 由 e2e、gateway 由 `test/integration/` 的兩實例測試）。**但 filter 與
  scheduler 不在此列**——它們有實際的判斷邏輯，`GlobalExceptionFilter.spec.ts` 與
  `ExampleScheduler.spec.ts` 是既有先例。新增這類檔案時要寫單元測試，不要往豁免清單加。
- **前端**（vitest）：coverage `include` 只列 `src/lib` 與 `src/components`，排除需 Router / api-client context 的組合層（pages、與 `/me` 整合的 hooks）；門檻 75/75/60/75。

門檻只有 `test:cov` 會執行（`test` 不帶 coverage，供開發時快速回饋）。

### 架構守則測試

把 `CLAUDE.md` 的 Hard Rules 從「文字約束」變成「會失敗的檢查」。純靜態掃描原始碼，不連 DB / Redis / HTTP，全部跑完約 0.2 秒。

```bash
pnpm --filter @app/api test:arch   # 只跑架構守則
pnpm --filter @app/api test        # 單元測試 + 架構守則（串接執行）
```

現有規則（**數量與斷言數見 `test:arch` 的輸出**——寫在這裡的數字會過期，
而過期的基準值比沒有基準值更糟）：

> 這張表由 `guardrail-inventory.spec.ts` 檢查完整性：
> **新增一支守則卻沒在這裡補一列，`test:arch` 會紅**。
> 沒有那道檢查的話，這張表曾經漏掉 10 支——包含好幾支是當時剛加的。

| 檔案 | 守住的規則 |
| --- | --- |
| `no-native-error.spec.ts` | `src/**` 不得 `throw new Error`（業務錯誤一律 domain exception） |
| `layering.spec.ts` | controller 不得 import Prisma / persistence / `*Repository` |
| `side-isolation.spec.ts` | 路徑含 `/admin/` 與 `/front/` 的檔案不得互相 import |
| `response-codes.spec.ts` | domain exception 不得寫字面值 code；`ResponseCodes` 不得有死碼 |
| `no-inline-message.spec.ts` | exception 不得內嵌文案（文案只在 `response-messages.ts`） |
| `env-schema.spec.ts` | 每個 `process.env.X` 都必須宣告於 `envSchema`；**布林變數必須用 `z.enum(['true','false'])`**（`z.string()` 會把 `TRUE` / `1` 靜默當成 false，`z.coerce.boolean()` 則把 `'false'` 當成 true）|
| `dto-from-zod.spec.ts` | DTO 一律由 `z.infer` 推導，不得手寫 class / interface |
| `commonjs-baseline.spec.ts` | root 與 `apps/api` 不得出現 `"type": "module"` |
| `e2e-real-database.spec.ts` | e2e 不得 mock DB；spec 一律放 `test/e2e/`；**測試環境的設定必須密封**——`e2e-env.ts` 只能從開發者的 `.env` 取 `DB_*`，`config()` 必須帶 `processEnv` |
| `swagger-sync.spec.ts` | 契約三段轉換同步；**成功狀態碼須與 `@HttpCode` 一致** |
| `hook-scripts.spec.ts` | `.agents/hooks/*.sh` 語法正確且都有註冊 |
| `openspec-schema.spec.ts` | 自訂 schema 存在；建立 change 一律帶 `--schema`（掃**所有現行指示文件**：`.claude/`、`openspec/`、`CLAUDE.md`、`README.md`，**排除封存區**）；opsx 指令維持薄殼 |
| `openspec-spec-format.spec.ts` | 能力命名前綴；`api-*` 的 endpoint 需求須寫請求與回應；**Purpose 不得留空或含 `TBD`**（`openspec archive` 只合併 `## Requirements`，Purpose 是留給人補的） |
| `project-docs.spec.ts` | `project.md` 索引連結有效、無孤兒子檔、全 repo 引用有效 |
| `compose-files.spec.ts` | 每份 compose 都有 script 會啟動；對外埠須寫進 README；docker 相關檔案提到的 `pnpm <script>` 須存在 |
| `global-guards.spec.ts` | 認證與授權 guard 全域註冊，且授權排在 `JwtAuthGuard` 之後 |
| `sanitize-coverage.spec.ts` | request DTO 中看起來敏感的欄位，實際餵進 `sanitize()` 驗證真被遮蔽 |
| `traditional-chinese.spec.ts` | 全專案不得混入日文假名或非繁體漢字 |
| `authorization-coverage.spec.ts` | 收外部輸入的 handler 必須有 `@Permissions` / `@Roles` / `@Public`——本專案第一條「檢查應存在而不存在」的規則。**自帶合成輸入的自我測試**（註解冒充裝飾器、識別碼走 body、裝飾器寫在 method 上方等七個判定） |
| `guardrail-inventory.spec.ts` | 守則檔數量不得低於基準（**只擋變少**）；文件不得寫死守則數量；本表必須涵蓋每一支守則 |
| `public-surface.spec.ts` | 免認證路徑必須精確比對；`app.use()` 掛載須列入豁免清單（那些完全不經過 Nest 的 guard）；**IP 黑白名單 Guard 不得以 `@Public()` 作為豁免依據**（登入端點也是 `@Public()`），基礎設施探針的路徑豁免要寫理由且不得過期 |
| `session-revocation.spec.ts` | 停用帳號的路徑必須撤銷既有 WS 連線——**只注入不呼叫不算** |
| `role-permission-cache.spec.ts` | 變更角色授權的路徑必須清除成員的 `MemberContext` 快取 |
| `layering.spec.ts` 內另含 | **admin 模組不得 import `ChatWsModule`**——需要撤銷連線走 `SessionRevocationModule`、需要推播走 `EventPublisherModule` |
| `permission-catalog-sync.spec.ts` | 權限樹的中文對照須涵蓋 `PERMISSION_CATALOG` 的每個 platform / module（且無死字串）；`SecurityController` 須維持 `@Roles(SUPERADMIN)`——前端有一段寫死的「不可指派」說明靠它才成立 |
| `presence-scan.spec.ts` | 請求路徑不得使用 Redis 的 keyspace 掃描（判定以**方法**為單位，不是檔案） |
| `observability.spec.ts` | 稽核 port 的呼叫必須接住錯誤；application 層不得相依 `prom-client` |
| `retention-scope.spec.ts` | 保留策略的清理範圍不得擴及訊息（`seq` 缺口會讓補齊的客戶端分不出「被清掉」與「我漏收了」） |
| `chat-message-single-entry.spec.ts` | 訊息的持久層存取只能有一個入口（多入口會讓撤回的內容遮蔽漏掉其中一條讀取路徑） |
| `ws-rate-limit.spec.ts` | WebSocket 事件必須表態限流；豁免不得以「連線層已有限流」為理由 |
| `ws-resource-authorization.spec.ts` | WebSocket 事件的資源存取必須經授權判斷（連線層的認證只回答「你是誰」） |

**新增一條規則的作法**（三步缺一不可）：

1. 用 `helpers.ts` 的 `collectSourceFiles` / `findViolations` 寫規則，失敗訊息用 `violationReport(violations, '繁中修正指引')` 組裝——輸出會帶每筆 `檔案:行號`。
2. 加一支「掃描範圍有效」測試（`expect(files.length).toBeGreaterThan(0)`）。**沒有這道檢查，目錄改名或命名慣例不同就會掃到 0 個檔案並靜默全綠**（實例：controller 命名是 `XxxController.ts` 而非 `xxx.controller.ts`）。
3. **反向驗證**：插一個違規探針 → 親眼看它變紅 → 移除探針 → `git diff` 確認乾淨。沒看過紅的架構測試等於沒證明任何事。

**豁免機制**（`allowlist.ts`）：`PERMANENT` 需附理由（如「SMTP 未初始化屬環境設定錯誤，回 500 語意正確」）；`TEMPORARY` 需指名負責清除它的 change。每條規則都會驗證「豁免項目在原始碼中確實仍存在」，違規修掉卻忘了刪豁免會**失敗**，避免白名單單向膨脹。

**與 eslint 的分工**：單檔就能判定的 import 邊界交給 `eslint.config.mjs` 的 `@typescript-eslint/no-restricted-imports`（快、IDE 即時）；跨檔語意（錯誤碼註冊、死碼、env 宣告）交給架構測試。⚠️ flat config 中同名規則**後蓋前、不合併 patterns**，重疊的檔案範圍（如 admin 下的 controller）必須各自列齊完整限制。
