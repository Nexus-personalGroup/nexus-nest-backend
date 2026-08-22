# Project: nexus-nest-backend

即時聊天平台。後端採六角架構（Hexagonal Architecture）的 NestJS API，前端為後台管理 SPA，API 契約透過 OpenAPI 共享。衍生自 `hexagonal-nest-express-mysql` 模板。本檔為架構與慣例的**單一事實來源**，README 與 CLAUDE.md 只連結過來，不重複寫架構細節。

---

## 目的

**產品目標**：具備可靠投遞與完整可觀測性的即時聊天服務。Phase 1 只做聊天，做到 production 等級——多實例水平擴展、訊息不重不漏、管理端看得見系統與使用者行為。

- **後端 admin REST API**：認證（登入 / 登出 / refresh / 忘記密碼 / 重設密碼）、會員管理、角色與權限管理、安全管理（IP 白名單 / 黑名單 / 帳號解鎖）、健康檢查。
- **後端即時通訊層**：WebSocket 連線與認證、Redis presence（跨實例一致、實例死亡自動回收）、跨實例廣播、聊天室與成員關係（1:1 私聊唯一性由 DB 約束保證；加入房間需通過成員資格判斷）、訊息收發（`clientMessageId` 去重、房間內單調遞增 `seq`、斷線補齊、送訊息限流）、已讀回條與訊息撤回（軟刪除；內容保留供檢舉調查但不外流）。與訊息撤回（軟刪除；內容保留供檢舉調查但不外流）。**可觀測性**：Prometheus 自訂指標（連線數、訊息量、寫入延遲、限流觸發）與 `chat_audit_log` 行為稽核（只記無法回溯的行為，不記訊息內容）。**檢舉**：使用者可檢舉他人訊息（只檢舉訊息、同一人冪等、被檢舉者不知情；檢舉會快照當下內容供審閱）。**後台審閱**：檢舉佇列、單筆詳情（唯一能看到被撤回內容的路徑，查看會留稽核）、狀態流轉、成員行為時間軸；權限碼 `BACKEND:MODERATION:VIEW` / `EDIT` 分開。**保留策略**：稽核紀錄 180 天、檢舉判定後 365 天（未判定的永不清）；**訊息刻意不清**——清了會讓 `seq` 重新出現洞，補齊的客戶端無法區分「被清掉」與「我漏收了」。**管理員移除訊息**（與使用者撤回用不同欄位——兩者對客戶端的語意不同；可還原，移除與還原都留稽核）。**停權**（停用帳號會**主動斷開既有的 WebSocket 連線**——連線層的認證只在 handshake 執行一次，不撤銷的話被停權者只要連線還開著就能繼續送訊息；審閱側與帳號管理側兩個入口呼叫同一個 use case）。**連線層事件限流**（每條連線每秒的事件數上限，含 `ping`；與送訊息限流是兩道獨立防線，
計數單位分別是「單一連線」與「成員 + 房間」，互相取代不了——見 `project/backend-runtime.md`）。
**後台審閱介面**：`/moderation/reports` 佇列、`/moderation/reports/:reportId` 詳情
與 `/moderation/members/:memberId` 成員概覽（檢舉統計、所在聊天室、相關檢舉、行為紀錄；
只從檢舉點進去，Sidebar 沒有入口）與 `/moderation/rooms` 聊天室總覽
（房間清單、成員、訊息量；**刻意不提供任何訊息內容的入口**——
看內容只能經由檢舉，那保持了「看內容必須有理由」）。
檢舉、成員、聊天室三者互相連得起來
（判定、移除／還原訊息、停權／解除、被檢舉者行為時間軸）。查詳情會寫稽核，
因此前端刻意不 prefetch。附件訊息與訊息保留見 `tasks/todo.md`。
- **前端 admin SPA**：**純後台管理**——登入、權限保護、會員 / 角色 / 安全管理頁面，以及聊天服務的監控儀表板（規劃中，見 M4）。**使用者端聊天前台為獨立專案，不在本 repo 內。**
- **共用 API client**：從後端 OpenAPI bundle 自動產生型別 + TanStack Query hooks，後端 controller 改動時前端編譯期捕捉。

---

## Monorepo 結構

```
nexus-nest-backend/
├── apps/
│   ├── api/                  # NestJS 後端
│   └── web/                  # React 19 + Vite admin SPA
├── packages/
│   └── api-client/           # 由 openapi.bundle.yaml 產生的型別安全 client
├── openspec/                 # 規格驅動開發產物（本檔 + changes/ + specs/）
├── tasks/                    # lessons.md + todo.md
├── pr/                       # code review 報告
├── pnpm-workspace.yaml       # workspace + allowBuilds 宣告
├── pnpm-lock.yaml
├── tsconfig.base.json        # 三個 workspace 共用 TS 設定（strict / target / ...）
└── package.json              # root scripts + 共用 devDeps（concurrently、openspec CLI）
```

- 套件管理：**pnpm 11+**，corepack 透過 `packageManager` 欄位鎖版本。
- **依賴版本覆寫（overrides）一律寫在 `pnpm-workspace.yaml`**：pnpm 10+ 起 `overrides` / `allowBuilds` 等設定從 `package.json` 的 `pnpm` 欄位搬到本檔，寫錯位置會被**靜默忽略、不會有任何警告**（本專案原本宣告在 `apps/api/package.json`，長期完全沒生效）。改動後務必驗證：`pnpm-lock.yaml` 開頭應出現 `overrides:` 區塊，並以 `pnpm why <pkg>` 確認實際安裝版本。range 用 `^` 而非 `>=` —— 後者沒有上界，pnpm 會拉到 major 新版（實測 `@hono/node-server` 從 1.19.x 直接跳到 2.1.0）。
- workspace 之間互引用使用 `workspace:*` 協定。
- 各 workspace 命名統一 `@app/*` scope（fork 後可整批替換）。
- `apps/web` 透過 Vite proxy（`/api` → `http://localhost:3000`）與後端通訊；`@app/api-client` 採 **source-first**（exports 直接指 `src/index.ts`，由 Vite / tsc 直接吃 TS，**無 dist build 階段**）。

---

## 技術棧

### 後端 `apps/api`

| 分類            | 套件                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| Runtime         | Node.js 20+                                                                     |
| Framework       | NestJS 11 + Express 5                                                           |
| Language        | TypeScript 5（strict）                                                          |
| ORM             | Prisma 7 + `@prisma/adapter-pg`                                                 |
| Database        | PostgreSQL 17（UTC 由欄位層 `@db.Timestamptz(3)` 保證，非 driver 設定）        |
| Validation      | Zod 4（DTO）+ `ParseUUIDPipe`（route param）                                    |
| Auth            | JWT（`@nestjs/jwt`）+ Redis token blacklist + Redis member-context cache        |
| Logging         | Pino + `pino-roll`（檔案輪替）+ DB via `SaveSystemLogPort`                      |
| Rate limit      | `@nestjs/throttler`                                                             |
| Security header | `helmet`（CSP 關閉以相容 Swagger UI，其餘標頭預設啟用）                         |
| Health check    | `@nestjs/terminus`（liveness + readiness，探 DB / Redis）                       |
| Observability   | Sentry（`@sentry/nestjs`）+ Prometheus（`@willsoto/nestjs-prometheus`），皆 flag 預設關閉 |
| 排程            | `@nestjs/schedule` + `cron`（`onModuleInit` 動態註冊，env gate 預設關）         |
| 靜態 / 單一埠   | `@nestjs/serve-static`（`forRootAsync` 服務 `apps/web/dist`，exclude `/api`）   |
| Mail            | Nodemailer                                                                      |
| Files           | AWS S3（`@aws-sdk/client-s3`、presigned URL）                                   |
| Push            | Firebase Admin SDK                                                              |
| API Docs        | Swagger 3：分檔 yaml + `swagger-cli bundle`                                     |
| WebSocket       | Socket.IO 4 + `@socket.io/redis-adapter`（跨實例廣播）、`/chat` namespace、`transports: ['websocket']` |
| 在線狀態        | Redis Hash + 心跳續期（`presence:member:{id}`，field 帶最後心跳時間）           |
| Testing         | Jest 29（unit + supertest e2e + 兩實例 integration）                            |

### 前端 `apps/web`

| 分類      | 套件                                                              |
| --------- | ----------------------------------------------------------------- |
| 建構工具  | Vite 8                                                            |
| UI 框架   | React 19 + TypeScript 6（strict）                                 |
| 樣式      | Tailwind CSS v4（`@import 'tailwindcss';`，無 PostCSS config）    |
| 元件庫    | shadcn/ui（Nova preset、neutral 配色、Geist 字體）                |
| 路由      | React Router v7（declarative mode）                               |
| 資料層    | TanStack Query v5（搭配 `@app/api-client` 的 hooks factory）      |
| 表單      | react-hook-form + zod + **`standardSchemaResolver`**              |
| 表格      | TanStack Table v8                                                 |
| 圖示      | lucide-react                                                      |

### 共用 `packages/api-client`

| 分類           | 套件                                                |
| -------------- | --------------------------------------------------- |
| 型別產生       | `openapi-typescript`（將 OpenAPI yaml → `paths` 型別） |
| Runtime client | `openapi-fetch`                                     |
| 整合方式       | 包成 TanStack Query 風格 hooks，自動 unwrap 後端外殼 |
| 對外 API       | `createApiClient(baseUrl, getToken?)`、`createApiQueryHooks(client)` → `useApiQuery` / `useApiMutation` |

---

## 詳細內容導覽

本檔只放「這個專案是什麼」。細節依主題拆在 `openspec/project/`，需要哪塊讀哪塊：

| 想知道 | 讀這份 |
| --- | --- |
| 六角分層怎麼切、目錄放哪、命名與時間處理慣例、Swagger yaml 怎麼寫 | [`project/backend-architecture.md`](project/backend-architecture.md) |
| 認證流程、環境變數、RBAC、全域中介層、API 回應格式、功能開關、安全設定 | [`project/backend-runtime.md`](project/backend-runtime.md) |
| 日誌、脫敏、Zod、日期、檔案儲存、Seed、System Log、分頁、`gen:module` | [`project/backend-utilities.md`](project/backend-utilities.md) |
| `apps/web` 目錄與慣例、shadcn、`@app/api-client` 設計 | [`project/frontend.md`](project/frontend.md) |
| 單元／e2e／架構守則的分工、覆蓋率門檻、怎麼加一條守則 | [`project/testing.md`](project/testing.md) |
| spec / change 命名、`api-*` 的請求回應格式、tasks.md 塊式切分 | [`project/openspec-conventions.md`](project/openspec-conventions.md) |
| `.agents/hooks`、GitHub Actions 各 job、完整指令參考 | [`project/tooling.md`](project/tooling.md) |

---

## 本檔以外的資訊

| 主題 | 位置 |
| --- | --- |
| 過去踩過的坑與決定 | `tasks/lessons.md` |
| 跨 change 待辦 | `tasks/todo.md` |
| 進行中 change 提案 | `openspec/changes/<name>/` |
| 已封存 change | `openspec/changes/archive/<日期>-<name>/` |
| 已批准的能力規格 | `openspec/specs/<capability>/spec.md` |
| Claude 行為與 workflow | `CLAUDE.md`（英文） |
| 人類 onboarding | `README.md` |
