# platform-engineering-guardrails Specification

## Purpose

把 `CLAUDE.md` 的 Hard Rules 從「文字約束」變成「會失敗的檢查」。本 capability 定義哪些架構與慣例
規則必須被機器守住、以什麼方式檢查、豁免如何管理，以及測試基礎設施（e2e 共用斷言、未授權測試
產生器）該提供什麼保證。

分工判準：單檔即可判定的 import 邊界交給 eslint（lint 期 + IDE 即時），跨檔語意交給架構測試；
型別能表達的完整性（如常數是否存在）不另寫檢查，交給 TypeScript。
## Requirements
### Requirement: 分層邊界檢查

系統 SHALL 以自動化檢查確保 controller 不直接相依持久層。任何 `src/adapter/in/**/*.controller.ts` 檔案 MUST NOT import `PrismaService`、`PrismaClient` 或任何以 `Repository` 結尾的型別。

#### Scenario: controller 直接注入 Prisma

- **WHEN** 某 controller 加入 `import { PrismaService } from '...'`
- **THEN** 架構測試失敗，訊息列出違規檔名與該 import 所在行號

#### Scenario: controller 只相依 facade

- **WHEN** 所有 controller 皆只 import facade 與 DTO
- **THEN** 檢查通過

### Requirement: 例外處理慣例檢查

系統 SHALL 確保 `src/**` 不使用原生 `Error` 拋出業務錯誤。檢查 MUST 排除 `*.spec.ts`（測試中以 `throw new Error` 模擬失敗為合法用法），並 MUST 支援顯式豁免清單。

#### Scenario: 新增程式碼使用原生 Error

- **WHEN** 非測試檔出現 `throw new Error(`，且該位置不在豁免清單中
- **THEN** 架構測試失敗，訊息指出應改用 `DomainException` 子類或 NestJS `HttpException`

#### Scenario: 已知的基礎設施豁免

- **WHEN** 違規位置屬於豁免清單中「基礎設施初始化失敗」類別（SMTP / S3 / Firebase 未初始化、`MemberContext` 未設定）
- **THEN** 檢查通過，因為這類錯誤代表程式設定錯誤而非業務錯誤，回應 500 語意正確

#### Scenario: 豁免清單失效

- **WHEN** 豁免清單中的某個項目在原始碼中已不存在（違規已修掉）
- **THEN** 架構測試失敗，要求移除該筆過期豁免，避免白名單無限膨脹

### Requirement: 錯誤碼註冊完整性檢查

系統 SHALL 驗證錯誤碼以 `ResponseCodes` 為單一真相。`src/domain/exception/**` MUST NOT 以字面值傳入 code；`ResponseCodes` 中每個 key MUST 至少被一處引用。

檢查範圍刻意排除「使用不存在的 code」—— 該情形由 TypeScript 免費保證（`ResponseCodes.FOO` 不存在即型別錯誤），架構測試只負責型別擋不住的部分。

#### Scenario: exception 繞過常數傳字面值

- **WHEN** 某 domain exception 寫成 `super('SOME_CODE', ...)` 而非引用 `ResponseCodes` 常數
- **THEN** 架構測試失敗，列出該 exception 檔名、行號與應改引用的常數檔路徑

#### Scenario: ResponseCodes 出現死碼

- **WHEN** `ResponseCodes` 某個 key 在 `src/`、`test/` 中都沒有任何引用
- **THEN** 架構測試失敗，列出該 key 並要求刪除或補上使用處

### Requirement: 前後台隔離檢查

系統 SHALL 確保後台與前台程式碼互不相依。所屬側 MUST 以「檔案路徑是否含 `/admin/` 或 `/front/`」判定，而非列舉固定目錄 —— 分側結構同時存在於 `adapter/in/web/`、`application/service/` 與 `modules/`，且新增分側目錄時不應需要修改規則。屬於某一側的檔案 MUST NOT import 另一側路徑下的模組。

#### Scenario: 前台檔案引用後台程式碼

- **WHEN** 路徑含 `/front/` 的檔案 import 了含 `/admin/` 的路徑
- **THEN** 架構測試失敗，訊息指出共用邏輯應下沉至 `application` / `domain` / `shared`

#### Scenario: 分側目錄新增

- **WHEN** 在既有分層下新增一組 `admin/` 與 `front/` 目錄
- **THEN** 檢查自動涵蓋新目錄，無需修改規則程式碼

### Requirement: 環境變數宣告完整性檢查

系統 SHALL 確保所有環境變數皆經過驗證。`src/`、`scripts/`、`seeds/` 中每個 `process.env.X` 的 `X` MUST 宣告於 `validate-env.ts` 的 `envSchema`，未宣告者 MUST 列於顯式豁免清單。

#### Scenario: 使用未宣告的環境變數

- **WHEN** 程式碼讀取 `process.env.NEW_FLAG` 而 `envSchema` 沒有 `NEW_FLAG`
- **THEN** 架構測試失敗，訊息指出該變數會靜默為 `undefined`，須補進 `envSchema`

### Requirement: 掃描有效性自我檢查

每條以原始碼掃描實作的規則 MUST 斷言「掃描到的檔案數或比對數大於零」。當專案結構調整導致掃描路徑或樣式失效時，檢查 MUST 失敗而非靜默通過。

#### Scenario: 掃描路徑失效

- **WHEN** 目錄改名導致某規則掃到 0 個檔案
- **THEN** 該規則失敗並提示「掃描樣式可能已失效」，而不是回報「無違規」

### Requirement: 違規訊息可定位

所有架構檢查失敗訊息 MUST 包含違規的檔案路徑，且在可判定時包含行號，並以繁體中文說明應如何修正。

#### Scenario: 檢查失敗

- **WHEN** 任一架構規則檢查失敗
- **THEN** 輸出包含每筆違規的 `檔案路徑:行號` 與修正指引，而非僅回報布林結果

### Requirement: 架構檢查執行成本

架構檢查 MUST NOT 相依資料庫、Redis 或 HTTP 伺服器，且 MUST 可在單元測試指令中執行，不得併入需要真實資料庫的 e2e 流程。

#### Scenario: 在無資料庫環境執行

- **WHEN** 在未啟動 PostgreSQL / Redis 的環境執行架構檢查
- **THEN** 檢查正常完成並回報結果

### Requirement: import 邊界的 lint 期攔截

專案 SHALL 於 eslint 設定中以 `no-restricted-imports` 表達分層 import 限制，使違規在 lint 期即被攔截。

#### Scenario: 撰寫時即時回饋

- **WHEN** 開發者在 controller 中輸入受限的 import 路徑
- **THEN** eslint 回報錯誤，`pnpm lint` 亦以非零狀態結束

### Requirement: e2e 共用錯誤斷言

e2e 測試 SHALL 透過共用 helper 斷言錯誤回應，helper MUST 同時驗證 HTTP status 與回應中的錯誤 code，且 code MUST 引用 `ResponseCodes` 常數而非字面值。

#### Scenario: 斷言錯誤回應

- **WHEN** 測試呼叫 `expectApiError(res, 404, ResponseCodes.MEMBER_NOT_FOUND)`
- **THEN** 同時驗證 HTTP status 與回應 body 的錯誤 code，任一不符即失敗

#### Scenario: 錯誤碼改名

- **WHEN** `ResponseCodes` 某個 key 被改名
- **THEN** 引用該常數的測試在型別檢查階段即失敗，不會因字面值不同步而漏測

### Requirement: 未授權存取測試產生器

專案 SHALL 提供產生器，讓受保護端點以單行宣告即涵蓋「未帶 token 應回 401」的測試。

#### Scenario: 宣告受保護端點

- **WHEN** 測試檔呼叫 `describeUnauthorized(app, 'get', '/api/admin/members')`
- **THEN** 自動產生一支未帶 token 的請求測試，並斷言回應為 401

### Requirement: exception 不得內嵌文案字面值

架構檢查 SHALL 確保 `src/domain/exception/**` 不出現中文字串字面值。訊息一律引用 `response-messages.ts`，避免文案在訊息表建立後又被寫回 constructor。

#### Scenario: 把文案寫回 exception

- **WHEN** 某 domain exception 的 constructor 直接寫入中文訊息字面值
- **THEN** 架構測試失敗，訊息指出應改為引用訊息表

#### Scenario: 引用訊息表

- **WHEN** exception 只指定 code 與 kind，或傳入訊息表函式的回傳值
- **THEN** 檢查通過

### Requirement: API 契約三段轉換必須同步

架構檢查 SHALL 守住從 controller 到前端型別的三段轉換，任一段不同步 MUST 使檢查失敗。比對以路由集合（HTTP method + path）為單位，且 MUST 正確處理 OpenAPI 的 `servers` base path 與 NestJS 的 `:param` / OpenAPI 的 `{param}` 兩種參數寫法差異。

#### Scenario: 新增 endpoint 但未撰寫 swagger

- **WHEN** controller 新增一支路由，來源 yaml 沒有對應宣告，且不在豁免清單中
- **THEN** 架構測試失敗，列出缺少文件的 method 與 path

#### Scenario: 改了來源 yaml 但未重跑 bundle

- **WHEN** 來源 yaml 的 paths 集合與 `openapi.bundle.yaml` 不一致
- **THEN** 架構測試失敗，指出需執行 `swagger:bundle`

#### Scenario: bundle 更新但未重新產生 api-client

- **WHEN** `openapi.bundle.yaml` 的 paths 集合與 `api-client/src/schema.ts` 的 `paths` key 不一致
- **THEN** 架構測試失敗，指出需執行 `api-client` 的 `generate`

#### Scenario: 刻意不納入文件的端點

- **WHEN** 某端點（如健康檢查）刻意不列入 API 文件並已登記於豁免清單
- **THEN** 檢查通過，且豁免項目同樣受過期檢查約束

### Requirement: 契約內容層級的同步驗證

專案 SHALL 提供指令，重新產生 bundle 與 api-client 型別後與現有產物比對內容，以涵蓋「路由集合未變但 schema 內容已變」的情形。該指令 MUST NOT 修改工作目錄中的任何檔案。

#### Scenario: 只改了 request body 欄位

- **WHEN** 某 endpoint 的 request schema 新增欄位、但路由集合沒有變化，且未重新產生產物
- **THEN** 該指令以非零狀態結束並指出產物已過期

#### Scenario: 執行後工作目錄不受影響

- **WHEN** 執行該指令
- **THEN** 產物一律寫入暫存目錄，`git status` 不出現任何變更

### Requirement: 前端分層邊界

`apps/web` SHALL 以 eslint `no-restricted-imports` 表達分層方向，違規 MUST 在 lint 期被攔截。

#### Scenario: 下層反向相依上層

- **WHEN** `src/lib`、`src/hooks` 或 `src/components` 之下的檔案 import `src/routes` 的模組
- **THEN** lint 失敗，訊息指出應由上層傳入而非反向相依

#### Scenario: 路由之間互相相依

- **WHEN** 某個 route 目錄下的檔案 import 另一個 route 目錄的模組
- **THEN** lint 失敗，訊息指出共用邏輯應下沉至 `lib` 或 `components`

#### Scenario: UI 原子元件相依業務層

- **WHEN** `src/components/ui`（shadcn 生成）之下的檔案 import API 或業務模組
- **THEN** lint 失敗，維持原子元件的可重用性

### Requirement: 產生器產出物必須通過所有護欄

`gen:module` 產出的模組 MUST 在不經任何手動修改的情況下通過 `typecheck`、`lint` 與全部架構守則測試。產生器 MUST 同步維護其產出物所相依的共用檔（錯誤碼、訊息表、swagger 索引）。

#### Scenario: 產生新模組後立即驗證

- **WHEN** 執行 `gen:module <name>` 後隨即執行 `pnpm typecheck`、`pnpm lint` 與架構守則測試
- **THEN** 三者皆通過，開發者只需補 Prisma model 與實際欄位

#### Scenario: 新增護欄規則時

- **WHEN** 新增任何架構守則或型別約束
- **THEN** 必須一併確認 `gen:module` 的產出物仍符合該規則

#### Scenario: 共用檔注入重複執行

- **WHEN** 對同一模組名稱重複執行產生器
- **THEN** 共用檔的注入為冪等，不產生重複項目

### Requirement: hook 邏輯必須可獨立執行與檢查

AI 工具的 hook 邏輯 SHALL 放在工具無關的 script 檔中，設定檔只負責註冊。script MUST 能在不經由 AI 工具的情況下直接執行，且 MUST 納入語法檢查。

#### Scenario: 撰寫或修改 hook

- **WHEN** 需要新增或修改 hook 行為
- **THEN** 修改 `.agents/hooks/` 下的 script，而非設定檔中的字串

#### Scenario: hook script 語法錯誤

- **WHEN** 任一 hook script 有 shell 語法錯誤
- **THEN** 架構測試以 `bash -n` 檢出並失敗，不必等到 hook 實際觸發

#### Scenario: 非 Claude 工具呼叫

- **WHEN** 其他 AI 工具或 git hook 需要相同檢查
- **THEN** 可直接呼叫同一支 script；script 自行推斷專案根目錄，不相依特定工具的環境變數

### Requirement: 產物連動契約由 Stop hook 強制

當來源檔與其產生物存在連動關係時，系統 SHALL 於對話結束前檢查兩者是否一起變更，未同步 MUST 阻止結束並說明修正方式。

#### Scenario: 改了 swagger 來源但未重新產生

- **WHEN** `docs/swagger/**/*.yaml` 有變更，而 `openapi.bundle.yaml` 與 `api-client/src/schema.ts` 皆無變更
- **THEN** Stop hook 以非零狀態阻止結束，並提示應執行的指令

#### Scenario: 來源與產物一起變更

- **WHEN** 來源 yaml 與產物皆有變更
- **THEN** 檢查通過

### Requirement: CI 環境可於本機重現

專案 SHALL 提供以容器重現 CI 測試環境的方式，使 CI 相關改動不必推送即可驗證。

#### Scenario: 修改 CI 設定後

- **WHEN** 開發者調整 CI 的測試 job
- **THEN** 可在本機以容器執行等價的驗證，不需等待實際 pipeline

### Requirement: DTO 型別一律由 Zod schema 推導

`adapter/in/web` 下的 request / query 型別 MUST 以 `z.infer` 自 Zod schema 推導，MUST NOT 手寫 `class` 或 `interface` 宣告。

#### Scenario: 手寫 DTO 型別

- **WHEN** 某個 `*Request.ts` 或 `*Query.ts` 以 `class` / `interface` 宣告型別而非 `z.infer`
- **THEN** 架構測試失敗，指出應改用 Zod schema 推導

### Requirement: e2e 不得 mock 資料庫

e2e 測試 MUST 對真實測試資料庫執行，MUST NOT 覆寫 `PrismaService`。測試基礎設施 MUST NOT 提供 mock 資料庫的入口。

#### Scenario: 覆寫 PrismaService

- **WHEN** 任一 e2e spec 以 `overrideProvider(PrismaService)` 注入假物件
- **THEN** 架構測試失敗

#### Scenario: 測試 helper 提供 mock 入口

- **WHEN** `test-app.ts` 的 overrides 型別出現可注入假 Prisma 的欄位
- **THEN** 架構測試失敗——留著入口會讓規則形同虛設

### Requirement: 維持 CommonJS baseline

root 與 `apps/api` 的 `package.json` MUST NOT 設定 `"type": "module"`。`apps/web` 為明文例外（Vite ESM by design）。

#### Scenario: 後端 workspace 切換為 ESM

- **WHEN** root 或 `apps/api` 的 `package.json` 加入 `"type": "module"`
- **THEN** 架構測試失敗，指出會連鎖破壞 nest CLI / ts-jest / decorator metadata

### Requirement: 授權裝飾器覆蓋檢查

系統 SHALL 確保接受外部輸入的端點都明確表態授權。任何 controller handler
若含 `@Param(` / `@Body(` / `@Query(` 之一，且其 class 與 method 皆無
`@Permissions(` / `@Roles(` / `@Public(`，檢查 MUST 失敗。

觸發條件不限於路徑參數——「接受任意資源識別碼」不等於「用 `@Param`」，
`POST /xxx { ids: [] }` 這類 body 帶識別碼的端點同樣需要表態。

此規則的方向與其他授權檢查**相反**：其他規則驗證「有標註的標對了」，本規則驗證
「該標的標了沒」。全域 guard 對未標註路由一律放行，因此漏標的後果是**沉默的授權繞過**
——裝飾器退化成註解、端點對任何已登入者開放、沒有錯誤訊息、測試照樣綠。

**實作 MUST 滿足三條約束**，否則規則會產生偽陰性而毫無徵兆：

1. **比對前 MUST 去除註解。** 說明某個裝飾器的註解，最常出現在「有那個裝飾器」的檔案裡。
   實測過：檔頭寫著「刻意用 RolesGuard + `@Roles(SUPERADMIN)` 粗粒度 role gate」時，
   拿掉真裝飾器只留註解，規則照樣全綠。
2. **class 層級 MUST 只取 `@Controller(` 至 `export class` 之間**，不得取 `export class`
   之前的全部內容——後者包含檔頭 TSDoc。
3. **handler 切塊 MUST 往前納入連續的裝飾器行。** `@Public()` 常寫在 HTTP method
   裝飾器上方，只從後者起算會把它歸給前一個 handler，造成前一支漏報、本支誤報。

自我範圍端點（含 `@CurrentMember()` 且不含 `@Param(`）MUST 豁免——它們操作的是呼叫者
自己的資料。**已知缺口**：`@CurrentMember()` 搭配 `@Body({ targetId })` 會被誤豁免；
堵它需解析 DTO 欄位語意，成本高於收益，指向他人資源 SHOULD 用 `@Param`。

本規則的判定邏輯 MUST 可用合成輸入測試，且 MUST 涵蓋上述三條約束各自的失效情境——
守則出錯是靜默的，給出偽陰性的守則比沒有守則更危險，它會讓人停止人工檢查。

#### Scenario: 收資源識別碼但未表態

- **WHEN** 某 handler 有 `@Param('id')` 卻無任何授權裝飾器
- **THEN** 檢查失敗，訊息列出 `檔案:行號` 與 handler 名稱

#### Scenario: 識別碼走 body 而非路徑參數

- **WHEN** 某 handler 以 `@Body()` 接收識別碼且無任何授權裝飾器
- **THEN** 檢查失敗——觸發條件不限於 `@Param`

#### Scenario: 註解提及裝飾器不算表態

- **WHEN** class 的檔頭註解出現 `@Roles(` 字樣，但無真正的授權裝飾器
- **THEN** 檢查失敗——比對對象是去註解後的裝飾器區段

#### Scenario: 授權裝飾器寫在 HTTP method 裝飾器上方

- **WHEN** `@Public()` 宣告於 `@Post()` 之上
- **THEN** 該 handler 視為已表態，且**不得**被歸給前一個 handler

#### Scenario: 自我範圍端點不受限

- **WHEN** handler 用 `@CurrentMember()` 取得呼叫者、不收 `@Param`
- **THEN** 檢查通過——它操作的本來就是呼叫者自己的資料

#### Scenario: 自我範圍豁免不適用於收路徑參數者

- **WHEN** handler 同時有 `@CurrentMember()` 與 `@Param('id')`
- **THEN** 仍須表態授權——`@Param` 是「指向任意資源」的訊號

#### Scenario: 明示公開亦為表態

- **WHEN** handler 標了 `@Public()`
- **THEN** 檢查通過——公開是刻意的決定，不是遺漏

### Requirement: 全域 guard 註冊與順序檢查

系統 SHALL 確保 `JwtAuthGuard`、`RolesGuard`、`PermissionsGuard` 皆以 `APP_GUARD`
全域註冊，且兩個授權 guard MUST 排在 `JwtAuthGuard` 之後。

授權 guard 全域化消滅了「漏掛 `@UseGuards`」整類 bug，但代價是全域註冊本身成為單點：
被移除時所有權限裝飾器會同時失效而無任何徵兆。順序亦為隱性依賴——兩者都讀
`JwtAuthGuard` 填入的 `request.member`，排前面會拿到 undefined 而靜默放行。

#### Scenario: 授權 guard 被移出全域註冊

- **WHEN** `PermissionsGuard` 自 `APP_GUARD` providers 移除
- **THEN** 檢查失敗，訊息說明「權限裝飾器將退化成註解」

#### Scenario: 授權 guard 排在認證之前

- **WHEN** `RolesGuard` 宣告於 `JwtAuthGuard` 之前
- **THEN** 檢查失敗，訊息說明 `APP_GUARD` 的宣告順序即執行順序

### Requirement: 敏感欄位脫敏覆蓋檢查

系統 SHALL 掃描所有 request DTO 的欄位名，將看起來敏感者（含 `password` / `token` /
`secret` / `credential` / `apikey` / `privatekey` / `authorization` 字根）實際餵進
`sanitize()`，斷言其值被替換為 `[REDACTED]`。

檢查 MUST 呼叫真正的 `sanitize()` 而非重新實作判斷邏輯，否則兩邊會各自漂移。

#### Scenario: 新增的敏感 DTO 欄位未被遮蔽

- **WHEN** 某 request DTO 新增一個 `sanitize()` 的字根清單涵蓋不到的敏感欄位
- **THEN** 檢查失敗，訊息指出該欄位會明文寫進 `system_logs`

### Requirement: 繁體中文一致性檢查

系統 SHALL 掃描 `apps` / `packages` / `openspec` / `tasks` / `.agents` 與根目錄文件，
拒絕日文假名與日文新字體／簡體字。規則檔自身與 `pr/`（review 報告會逐字引用問題碼）
MUST 排除。

單字級的字形混入（日文新字體與其繁體對應字往往只差一兩筆）在人工 review 中幾乎不可能穩定攔截。

#### Scenario: 註解混入日文新字體

- **WHEN** 某程式碼註解混入日文新字體
- **THEN** 檢查失敗，訊息列出 `檔案:行號` 與命中的字元

### Requirement: openspec 自訂 schema 的執行路徑檢查

系統 SHALL 確保專案的 openspec 格式規範真的會生效：自訂 schema 與四份模板存在、
`schema.yaml` 可解析且四個 artifact 齊全、建立 change 的指令一律帶
`--schema spec-driven-custom`、進行中的 change 皆使用該 schema、
且 `.claude/commands/opsx/*` 維持轉呼叫 skill 的薄殼。

`openspec config` 只支援 global scope，專案預設 schema 進不了版控——少帶旗標就會
靜默落回內建 schema，所有格式規範一條都不生效。

#### Scenario: 建立指令漏帶旗標

- **WHEN** `.claude/` 底下任一份文件的 `openspec new change` 未帶 `--schema`
- **THEN** 檢查失敗並指出該檔案

#### Scenario: opsx 指令重新抄回完整流程

- **WHEN** 某支 opsx 指令檔超過 40 行或不再轉呼叫 skill
- **THEN** 檢查失敗——流程只能有一份真相

### Requirement: master spec 的命名與格式檢查

系統 SHALL 確保 `openspec/specs/` 的能力名稱帶 `api-` / `ui-` / `platform-` / `ws-` 前綴、
spec.md 的標題行與目錄名一致、`api-*` 中宣告 endpoint 的需求皆寫出 Request 與
Success / Failure Response、`ws-*` 中宣告事件的需求皆寫出該方向所需的區塊、
且 `ui-*` / `platform-*` / `ws-*` MUST NOT 寫 HTTP 的 API 回應區塊。

格式規範由 `openspec instructions` 在產生 artifact 時餵給 AI，但**產生之後就沒有東西
再檢查**——spec 被手改或 AI 沒照做都不會有徵兆。

WebSocket 事件契約的形狀與 HTTP endpoint **不對稱**，因此不能共用同一組必填區塊：
客戶端送入的事件有 payload 與可選的 ack，伺服器推送的事件則沒有對應的請求可回應。
以需求內文第一行的方向標記判定：

| 第一行 | 必填區塊 |
| --- | --- |
| `` `client:<event>` `` | **Payload**、**Ack**、**Failure Responses** |
| `` `server:<event>` `` | **Payload** |

`client:` 的事件即使沒有 ack 也 MUST 明示「本事件無 ack」，MUST NOT 省略——
省略與「忘了寫」在文件上長得一模一樣。

#### Scenario: 能力名稱缺少分類前綴

- **WHEN** `openspec/specs/` 出現不帶前綴的目錄
- **THEN** 檢查失敗並說明四類前綴各自的寫法

#### Scenario: api 端點需求缺少回應形狀

- **WHEN** `api-*` 中某需求以 `` `METHOD /path` `` 開頭但無 Success Response
- **THEN** 檢查失敗並指出該需求名稱

#### Scenario: WebSocket 事件需求缺少必填區塊

- **WHEN** `ws-*` 中某需求以 `` `client:<event>` `` 開頭但沒有寫 Ack
- **THEN** 檢查失敗並指出該需求名稱與缺少的區塊

#### Scenario: WebSocket 契約誤用 HTTP 的區塊

- **WHEN** `ws-*` 的 spec 出現 `**Success Response**`
- **THEN** 檢查失敗——WS 事件的回應形狀是 Ack，混用會讓「非 api- 不得寫 API 回應區塊」失去意義

#### Scenario: 尚無任何 ws-* 能力

- **WHEN** 專案還沒有以 `ws-` 開頭的能力
- **THEN** 事件契約的檢查正常通過而非失敗——但其判定邏輯 MUST 有合成輸入的自我測試，
  否則規則在真正被使用之前都無從得知是否正確

### Requirement: 專案文件索引的連結完整性檢查

系統 SHALL 確保 `openspec/project.md` 連到的子檔皆存在、`openspec/project/` 底下無
未被索引連到的孤兒檔、且全 repo 對子檔的引用皆有效。

拆分文件的典型失效不是拆錯，而是**連結爛掉沒人發現**。

#### Scenario: 子檔改名後索引未更新

- **WHEN** `openspec/project/` 的某支檔案改名
- **THEN** 檢查失敗，同時報出索引失效與全 repo 的無效引用

#### Scenario: 新增子檔未掛進索引

- **WHEN** `openspec/project/` 出現未被 `project.md` 連到的檔案
- **THEN** 檢查失敗——讀的人找不到它

### Requirement: 契約的成功狀態碼同步檢查

系統 SHALL 比對每條路由在 controller 的 `@HttpCode`（未指定時 POST 為 201、
其餘為 200）與 OpenAPI 記載的 2xx，不一致即失敗。檢查 MUST 讀 bundle 而非來源 yaml
——來源的每條路由都是 `$ref`，`responses` 不在檔內。

原本的路由層級檢查只比對「路由存不存在於兩邊」，因此曾有 endpoint 的 yaml 寫
`200` + `data.message`、實作卻是 `204` 無 body，兩邊路由都在、檢查全綠，
錯的型別一路流進 `@app/api-client`。

#### Scenario: 狀態碼在兩邊不一致

- **WHEN** 某 endpoint 的 `@HttpCode(NO_CONTENT)` 但 yaml 記載 `200`
- **THEN** 檢查失敗，訊息同時列出 controller 與 yaml 各自的值

### Requirement: e2e spec 的位置檢查

系統 SHALL 確保所有 `*.e2e-spec.ts` 位於 `test/e2e/`。

jest 的 `testRegex` 是 `test/.*\.e2e-spec\.ts$`，放回平鋪一樣跑得到，
沒有守則的話目錄結構會靜默侵蝕回原狀。

#### Scenario: e2e spec 放在 test/ 根層

- **WHEN** 新增的 e2e spec 直接放在 `test/`
- **THEN** 檢查失敗並說明 `test/` 四個目錄的分工

### Requirement: compose 檔的執行路徑與文件同步檢查

系統 SHALL 確保每份 `compose*.yml` 都有 script 或腳本會啟動它、`compose.yml` 的對外埠
皆寫進 README、且 docker 相關檔案（compose / Dockerfile / `docker/`）提及的
`pnpm <script>` 確實存在於 `package.json`。

script 名稱檢查 MUST 只比對含冒號的名稱——散文中的「`.pnpm store`」「pnpm 11 需要」
不含冒號，藉此避免誤判；代價是漏掉 `pnpm dev` 這類單字名，但那些是慣例名稱、幾乎不改。

#### Scenario: compose 檔沒有任何指令會啟動

- **WHEN** 新增一份 compose 檔但未加對應 script
- **THEN** 檢查失敗——它是死檔

#### Scenario: script 改名後 docker 註解未更新

- **WHEN** `docker/` 底下的註解仍寫著已不存在的 `pnpm <script>`
- **THEN** 檢查失敗並指出該檔案與指令

### Requirement: 分層守則必須涵蓋所有 in 側進入點，不限 Controller

「不得直接相依持久層」的檢查 SHALL 涵蓋 `adapter/in/` 下**所有**進入點類型，
包含 `*Controller.ts` 與 `*Gateway.ts`，以及日後新增的其他進入點形式。

以檔名後綴限定掃描範圍時，MUST 同時檢查「範圍內確實掃到檔案」與「新增的進入點類型
不會落在範圍外」。規則本身正確但掃描範圍寫死在既有型別，是本專案已發生過的缺陷型態——
新的進入點會在完全沒有阻力的情況下違反一條「已經存在」的規則。

#### Scenario: Gateway 直接注入持久層

- **WHEN** `adapter/in/ws/` 下的 gateway import Prisma 或 repository
- **THEN** 分層守則失敗，訊息包含違規檔案與行號

#### Scenario: 新增第三種進入點類型

- **WHEN** 新增既非 Controller 也非 Gateway 的進入點
- **THEN** 該類型 MUST 被納入掃描範圍，否則守則的涵蓋率會隨架構演進而靜默衰退

### Requirement: 外部輸入的 schema 驗證守則必須涵蓋非 HTTP 進入點

「DTO 一律由 Zod 推導」的檢查 SHALL 涵蓋所有接受外部輸入的進入點，
不限於 `adapter/in/web`。

WebSocket 事件 payload 與 HTTP request body 的信任等級相同，
把驗證守則的掃描範圍綁在 HTTP 目錄等於默許 WS 走較寬鬆的標準。

#### Scenario: WS 事件型別以 interface 手寫

- **WHEN** `adapter/in/ws/` 下出現手寫的 payload 型別而非 `z.infer`
- **THEN** 守則失敗

### Requirement: 授權涵蓋率守則必須涵蓋 WebSocket 事件 handler

「進入點必須有明確的授權標註」的檢查 SHALL 涵蓋 WebSocket 的事件 handler。

漏掛認證的 handler 與漏掛授權的 controller 是同一種缺陷：**它遵守了所有現存規則，
只是缺少沒有規則要求它具備的東西**。本專案已因此發生過一次附件端點的 IDOR。

#### Scenario: 事件 handler 未標註認證

- **WHEN** `@SubscribeMessage` 的 handler 既無認證標註、也未列入豁免清單
- **THEN** 守則失敗

#### Scenario: 豁免項目未說明理由

- **WHEN** 某 handler 被列入豁免清單但未註明理由
- **THEN** 守則失敗——豁免清單失去理由就會逐漸長大

