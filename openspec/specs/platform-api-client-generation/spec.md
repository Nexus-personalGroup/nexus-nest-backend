# platform-api-client-generation Specification

## Purpose
定義 `packages/api-client` 的產生與使用契約：型別如何從後端的 OpenAPI bundle 推導、
產物為何進版控、產生流程為何獨立於 build，以及對外暴露的 runtime API。

核心約束是**單向推導**：後端 controller 是唯一真相，型別經
`swagger:bundle → openapi-typescript` 產生，前端不得手寫或修改產物。
三段轉換的同步由 `platform-engineering-guardrails` 的守則保證。
## Requirements
### Requirement: API client 從 OpenAPI bundle 產生

`packages/api-client/` SHALL 從 `apps/api/` 的 `openapi.bundle.yaml` 自動產生 TypeScript 型別與 runtime client。

- MUST 使用 `openapi-typescript` 產生型別至 `packages/api-client/src/schema.ts`。
- MUST 使用 `openapi-fetch` 作為 runtime fetch client。
- MUST NOT 使用 `orval`、`openapi-generator-cli`、`@openapitools/openapi-generator-cli` 等重量級工具。
- MUST NOT 手寫 fetch wrapper 與型別重複定義。

#### Scenario: 後端新增 endpoint 後同步型別

- **WHEN** 開發者新增 controller endpoint 並執行 `pnpm --filter @app/api swagger:bundle` 後再執行 `pnpm --filter @app/api-client generate`
- **THEN** `packages/api-client/src/schema.ts` 包含新 endpoint 的 path / request / response 型別

### Requirement: `schema.ts` 進入版控

產生的 `packages/api-client/src/schema.ts` SHALL 視為原始碼之一進入 git。

- MUST NOT 加入 `.gitignore`。
- API 變更 MUST 在 PR diff 中可見（透過 schema.ts 的變動）。
- CI 或 pre-commit 檢查（後續 change）MAY 驗證 schema.ts 與 bundle 是否同步。

#### Scenario: PR 顯示 API 變動

- **WHEN** 開發者提交修改 controller 的 PR
- **THEN** PR diff 同時顯示 `openapi.bundle.yaml` 與 `packages/api-client/src/schema.ts` 的變動

### Requirement: 產生流程獨立於 build

API client 的型別產生 SHALL 為獨立指令，不在每次 build 自動執行。

- `packages/api-client/package.json` MUST 提供 `generate` script 執行 `openapi-typescript`。
- `build` script MUST NOT 隱含執行 `generate`。
- root `pnpm build` MUST NOT 自動觸發 `generate`，避免 build 結果隨 bundle 變動。

#### Scenario: 開發者手動更新 client

- **WHEN** 開發者執行 `pnpm --filter @app/api-client generate`
- **THEN** 僅重新產生 `schema.ts`，不執行 build 或 typecheck

### Requirement: Client runtime API

`packages/api-client/` SHALL 提供以下對外 API：

- `export type * from './schema'`：對外公開所有 path / component 型別。
- `createApiClient(baseUrl: string, getToken?: () => string | null)`：建立帶有 `Authorization` 注入能力的 `openapi-fetch` client。
- `createApiQueryHooks(client)`：包出 TanStack Query 的 `useApiQuery` 與 `useApiMutation` 兩個 hook factory，型別跟著 path 自動推導。

#### Scenario: 前端建立 client

- **WHEN** `apps/web/src/api/client.ts` 呼叫 `createApiClient('/api', () => localStorage.getItem('access_token'))`
- **THEN** 回傳的 client 可用於後續所有 API 呼叫，且自動帶上 `Authorization` header

#### Scenario: 型別自動推導

- **WHEN** 前端呼叫 `useApiQuery('GET', '/auth/me')`
- **THEN** TypeScript 推導出對應的 response 型別，IDE 自動補全成功欄位

### Requirement: 依賴關係

`packages/api-client/` SHALL 將 React 與 TanStack Query 列為 `peerDependencies`，避免重複打包。

- `react`、`@tanstack/react-query` MUST 為 `peerDependencies`。
- `openapi-fetch` MUST 為 `dependencies`。
- `openapi-typescript` MUST 為 `devDependencies`（僅產生時需要）。

#### Scenario: pnpm install 不重複裝 React

- **WHEN** 在 root 執行 `pnpm install`
- **THEN** React 只在 `apps/web/node_modules` 出現一份，`packages/api-client` 透過 peer 解析共用

### Requirement: 不依賴後端原始碼

`packages/api-client/` SHALL 僅依賴 `apps/api/` 的編譯產物（`openapi.bundle.yaml`），不直接 import 後端 TS 檔。

- `generate` script MUST 讀取 `../../apps/api/openapi.bundle.yaml`，路徑可在 `package.json` 設定但 MUST 為相對 workspace。
- MUST NOT 出現 `from '../../apps/api/src/...'` 之類的 import。

#### Scenario: client 可獨立發佈

- **WHEN** 假想將 `packages/api-client/` 抽出獨立發佈
- **THEN** 不需要後端原始碼，只需 `openapi.bundle.yaml` 即可運作

