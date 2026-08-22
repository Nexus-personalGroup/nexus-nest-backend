# platform-public-surface Specification

## Purpose
TBD - created by archiving change fix-unauthenticated-surface. Update Purpose after archive.
## Requirements
### Requirement: 未認證可達的路徑必須明示

全域 `JwtAuthGuard` 之外的每一條免認證路徑 MUST 是**明示的表態**，
MUST NOT 靠路徑前綴或掛載順序默默生效。

明示的表態有兩種形式：

- **`@Public()` 裝飾器** —— Nest 路由的正規做法，已受既有守則涵蓋
- **`JwtAuthGuard` 內的路徑豁免** —— 給無法掛裝飾器的第三方 controller，
  MUST 用**精確比對**（去除 query string 後），MUST NOT 用 `startsWith` 或正規式前綴

前綴比對的性質是「未來新增的任何同前綴路徑自動免認證」，
而那不會有任何錯誤訊息提醒你——它是一條會自己長大的豁免。

`app.use()` 掛載的原生 Express middleware（Swagger UI、靜態檔）**完全不經過 Nest 的 guard**，
因此它們也 MUST 列入豁免清單並註明理由。這一點特別容易被忽略：
掛載處看起來只是「提供文件」，而 guard 那邊看起來「所有路由都保護了」——
兩邊各自都對，合起來有一條沒有人看守的路。

#### Scenario: 以前綴比對做豁免

- **WHEN** `JwtAuthGuard` 用 `startsWith` 或前綴正規式判斷是否跳過認證
- **THEN** 守則失敗——豁免必須精確到單一路徑

#### Scenario: 新增 `app.use()` 掛載的路由

- **WHEN** `main.ts` 以 `app.use('/some/path', ...)` 掛載新的處理器
- **THEN** 該路徑 MUST 在豁免清單中，否則守則失敗

#### Scenario: 豁免未註明理由

- **WHEN** 某條豁免路徑列入清單但沒有理由
- **THEN** 守則失敗——豁免一旦失去理由就會逐漸長大

### Requirement: API 文件的對外暴露必須可關閉

Swagger UI 與 OpenAPI spec 的掛載 SHALL 由 `SWAGGER_ENABLED` 控制。
該變數的預設值 MUST 依 `NODE_ENV` 決定：production 為 `false`，其餘為 `true`。

固定預設 `true` 會讓忘記設定的 production 裸奔；固定預設 `false` 會讓開發者
第一次跑起來就找不到文件。預設值唯一該有的性質是「什麼都不設就是對的」，
而這裡的「對」在兩種環境下不同。

關閉時 `/docs` 與 `/docs-json` **兩者都 MUST NOT 掛載**。只關 UI 是最容易犯的錯：
`docs-json` 才是真正有價值的那份（完整結構、可直接餵給工具），而它沒有介面所以不顯眼。

`/api/admin/docs-json` 對外提供的是完整的後台 API 結構——所有端點、參數 schema、
錯誤碼、權限碼命名。對攻擊者而言那是一份免費的地圖。

關閉 MUST NOT 影響開發流程：`swagger:check` 與 api-client codegen 走的是
本機檔案而非 HTTP 端點。

#### Scenario: production 未設定 SWAGGER_ENABLED

- **WHEN** `NODE_ENV=production` 且未設定 `SWAGGER_ENABLED`
- **THEN** `/api/admin/docs` 與 `/api/admin/docs-json` 皆回 `404`

#### Scenario: 開發環境未設定 SWAGGER_ENABLED

- **WHEN** `NODE_ENV=development` 且未設定 `SWAGGER_ENABLED`
- **THEN** 文件正常可用

#### Scenario: 明確開啟

- **WHEN** `SWAGGER_ENABLED=true` 且 `NODE_ENV=production`
- **THEN** 文件可用——明確設定優先於環境推導

#### Scenario: 關閉時 docs-json 也不可達

- **WHEN** `SWAGGER_ENABLED=false`
- **THEN** `/docs-json` MUST 回 `404`，MUST NOT 只關 UI 而留著 JSON

#### Scenario: 關閉不影響 codegen

- **WHEN** `SWAGGER_ENABLED=false`
- **THEN** `pnpm --filter @app/api swagger:check` 與 api-client 產生 MUST 照常成功

