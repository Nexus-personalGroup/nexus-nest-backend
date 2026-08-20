# platform-monorepo-workspace Specification

## Purpose
定義 monorepo 的骨架契約：三個 workspace（`apps/api`、`apps/web`、`packages/api-client`）
的目錄結構、pnpm workspace 的使用方式、`@app/*` 的套件命名慣例，以及共用的 TypeScript 設定。

這些是「動一處會影響全部」的決定——`overrides` 寫錯位置會被 pnpm 靜默忽略、
`tsconfig.base.json` 的 strict 設定由三個 workspace 繼承——因此收斂成單一 capability。
## Requirements
### Requirement: Workspace 目錄結構

repo 根目錄 SHALL 採用以下 monorepo 結構：

- `apps/` 存放可獨立執行的應用程式（後端、前端）。
- `packages/` 存放跨 app 共用的 library（型別、client、UI kit 等）。
- `openspec/`、`tasks/`、`pr/`、`docs/`、`CLAUDE.md` 保留在 repo root，作為整個 monorepo 的 meta 文件。
- 後端應用程式 MUST 位於 `apps/api/`，前端應用程式 MUST 位於 `apps/web/`。
- 共用 OpenAPI client MUST 位於 `packages/api-client/`。

#### Scenario: 後端原始碼位置

- **WHEN** 開發者要修改後端 controller
- **THEN** 對應檔案位於 `apps/api/src/adapter/in/web/` 之下

#### Scenario: 前端原始碼位置

- **WHEN** 開發者要新增前端頁面
- **THEN** 對應檔案位於 `apps/web/src/` 之下

#### Scenario: Meta 文件位置

- **WHEN** 開發者要更新 lessons 或 todo
- **THEN** 編輯 repo root 的 `tasks/lessons.md` 或 `tasks/todo.md`

### Requirement: 套件管理使用 pnpm workspace

repo SHALL 使用 pnpm 作為唯一套件管理工具，並透過 `pnpm-workspace.yaml` 宣告 workspace 範圍。

- repo root MUST 存在 `pnpm-workspace.yaml`，內容包含 `apps/*` 與 `packages/*`。
- repo root MUST 存在 `pnpm-lock.yaml`，並不存在 `package-lock.json` 或 `yarn.lock`。
- root `package.json` MUST 設定 `"private": true` 與 `"packageManager": "pnpm@<version>"` 鎖定版本。

#### Scenario: 安裝依賴

- **WHEN** 開發者 clone repo 後在 root 執行 `pnpm install`
- **THEN** 所有 workspace（`apps/*`、`packages/*`）的依賴一次安裝完成

#### Scenario: 禁止 npm install

- **WHEN** 開發者在 repo 內執行 `npm install`
- **THEN** 不會產生 `package-lock.json`（由 `packageManager` 欄位透過 corepack 阻擋或 lint 規則檢查）

### Requirement: Workspace 套件命名慣例

所有 workspace 套件 SHALL 使用 `@app/<name>` scope 命名，方便日後 fork 時統一替換。

- 後端 `package.json` 的 `name` 欄位 MUST 為 `@app/api`。
- 前端 `package.json` 的 `name` 欄位 MUST 為 `@app/web`。
- API client `package.json` 的 `name` 欄位 MUST 為 `@app/api-client`。
- workspace 之間引用 MUST 使用 `workspace:*` 協定（例如 `"@app/api-client": "workspace:*"`）。

#### Scenario: 前端引用 api-client

- **WHEN** `apps/web/package.json` 宣告依賴 `@app/api-client`
- **THEN** 版本欄位為 `"workspace:*"`，pnpm 解析為本機 `packages/api-client/`

### Requirement: 共用 TypeScript 設定

repo SHALL 提供 root `tsconfig.base.json` 作為所有 workspace 的共用 TS 設定。

- `tsconfig.base.json` MUST 啟用 `"strict": true`、`"target": "ES2022"` 或更新版本。
- 各 workspace 的 `tsconfig.json` MUST 透過 `"extends": "../../tsconfig.base.json"` 繼承。
- 修改共用 TS 規則 MUST 編輯 `tsconfig.base.json` 而非個別 workspace。

#### Scenario: 新增 workspace 套用共用設定

- **WHEN** 在 `packages/<new>/tsconfig.json` 加入 `"extends": "../../tsconfig.base.json"`
- **THEN** 新套件繼承 strict mode 等共用設定

### Requirement: Root 開發指令

root `package.json` SHALL 提供統一的開發指令，避免開發者需要記憶各 workspace 的個別命令。

- `pnpm dev` MUST 用 `concurrently` 並行啟動 `apps/api` 與 `apps/web` 的 dev server。
- `pnpm build` MUST 依序建置 `packages/api-client` → `apps/api` → `apps/web`。
- `pnpm typecheck`、`pnpm lint` MUST 透過 `pnpm -r` 在所有 workspace 執行對應命令。
- `pnpm test` MUST 執行所有 workspace 的 `test` script（目前僅 `apps/api` 有測試）。

#### Scenario: 一鍵啟動前後端

- **WHEN** 開發者在 root 執行 `pnpm dev`
- **THEN** 後端 NestJS 與前端 Vite dev server 同時啟動，輸出帶有各自前綴

#### Scenario: 一鍵 typecheck 整個 repo

- **WHEN** 開發者在 root 執行 `pnpm typecheck`
- **THEN** 三個 workspace 依序執行 `tsc --noEmit`，任一失敗整體 exit code 非 0

### Requirement: `.gitignore` 涵蓋 monorepo 產物

repo root `.gitignore` SHALL 涵蓋所有 workspace 的建構與快取產物。

- MUST 忽略 `node_modules`（root 與所有子目錄）、`dist`、`build`。
- MUST 忽略 `apps/web/dist`、`packages/api-client/dist`。
- MUST 忽略 `.pnpm-store/`、`.turbo/`（如未來導入）。
- MUST NOT 忽略 `pnpm-lock.yaml`。

#### Scenario: 確認 lockfile 進入版控

- **WHEN** 執行 `git status`
- **THEN** `pnpm-lock.yaml` 顯示為 tracked 檔案

### Requirement: `.env` 限定於後端 workspace

環境變數設定檔 SHALL 僅存在於需要的 workspace，不放 repo root。

- 後端 `.env`、`.env.example` MUST 位於 `apps/api/`。
- 前端若需環境變數 MUST 使用 Vite 慣例（`apps/web/.env`，變數名以 `VITE_` 開頭）。
- repo root MUST NOT 存在 `.env` 檔。

#### Scenario: 後端讀取環境變數

- **WHEN** 後端啟動時讀取 `DATABASE_URL`
- **THEN** 從 `apps/api/.env` 載入，工作目錄為 `apps/api/`

### Requirement: pnpm overrides 必須宣告於 workspace root

依賴版本覆寫 MUST 宣告在 root `package.json` 的 `pnpm.overrides`。宣告在子 workspace 的 `overrides` **不會生效**，且不會有任何警告。

#### Scenario: 需要覆寫傳遞依賴版本

- **WHEN** 需要強制某個傳遞依賴使用特定版本（通常為修補漏洞）
- **THEN** 於 root `package.json` 的 `pnpm.overrides` 宣告，並在安裝後驗證實際安裝版本符合預期

#### Scenario: 驗證覆寫是否生效

- **WHEN** 新增或修改任一 override
- **THEN** 以 `pnpm why <pkg>` 或檢查 `node_modules/.pnpm` 確認實際版本，不可只憑宣告認定已生效
