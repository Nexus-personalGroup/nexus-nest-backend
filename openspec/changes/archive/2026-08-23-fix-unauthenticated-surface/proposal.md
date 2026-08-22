## Why

專案審查（`pr/2026-08-22-09-30-project-review.md`）找到一個**未認證者可以單方面癱瘓系統**的缺口，
以及三個「沒有人會主動去看、但錯了會痛」的暴露面與預設值。四個都很小，但第一個沒有復原路徑。

**帳號鎖定寫進去就再也不會自己消失。** `lockedAt` 只被寫入、從不比對時效，
而清除它的兩條路徑都走不通：`resetFailedLogin()` 只在**登入成功**後呼叫，
而 `isLocked` 的檢查排在密碼驗證**之前**（`LoginService:108` vs `:131`）——
被鎖的帳號連「密碼打對」都到不了那條路；`POST /admin/security/unlock-account`
需要一個**已登入且具 SUPERADMIN 角色**的管理員。

配上 `APPLICATION_ACCOUNT_LOCK_THRESHOLD` 預設 3、`recordFailedLogin()` 以 email 為鍵
且完全不需認證即可觸發：知道管理員的 email → 打 3 次錯密碼 → 該帳號永久鎖定。
把已知的管理員 email 全鎖一輪，**沒有任何人能登入去解鎖**，只剩直接改資料庫這條路。
攻擊者根本不需要猜對密碼。

另外三個各自獨立、成本極小，但都屬於同一類「不看就不會發現」：

- **Swagger UI / OpenAPI spec 在 production 無條件對外開放**。`validate-env.ts` 裡
  連 `SWAGGER` 這個字串都不存在，而且它用 `app.use()` 掛原生 Express middleware，
  全域 `JwtAuthGuard` 根本碰不到（Nest 的 guard 只作用於 Nest 路由）。
  `/api/admin/docs-json` 直接吐出完整後台結構：所有端點、參數 schema、錯誤碼、權限碼命名。
- **`/api/metrics` 用 `startsWith` 豁免認證**。今天沒有 `/api/metrics-xxx` 這種路由，
  但這個寫法的性質是「未來新增的任何 `/api/metrics` 開頭路由自動免認證」，
  而那不會有任何錯誤訊息提醒你。
- **`DB_PORT` 的預設值是 `3306`** —— MySQL 的埠，模板時期的遺留。
  本專案是 PostgreSQL，任何人沒設 `DB_PORT` 就會去連一個不存在的服務。

## What Changes

- **後端**：新增 `APPLICATION_ACCOUNT_LOCK_DURATION_MIN`（預設 15），
  `isLocked` 改為比對時效；鎖定到期時**一併清除失敗計數**（見 design.md D2）。
- **後端**：新增 `SWAGGER_ENABLED`（production 預設 `false`，其餘預設 `true`），
  關閉時 `/docs` 與 `/docs-json` 都不掛載。
- **後端**：`/api/metrics` 的認證豁免改為**精確比對**（含去除 query string）。
- **後端**：`DB_PORT` 預設值 `3306` → `5432`。
- **守則**：新增「未認證可達的路徑必須明示」的架構守則
  （見 `platform-public-surface`）。

**不做**：

- **拉高 `APPLICATION_ACCOUNT_LOCK_THRESHOLD`**。審查建議從 3 拉高，理由是誤鎖率。
  但加了時效之後，誤鎖的代價從「永久」變成「15 分鐘」——而降低門檻的代價是
  暴力破解的空間變大。門檻是可設定的，預設維持 3。
- **break-glass 帳號**。審查建議保留一組不受鎖定影響的帳號。加了時效之後
  它要解決的問題已經不存在，而「有一個帳號永遠不會被鎖」本身是一個新的攻擊面。
- **`/api/metrics` 加認證**。它需要給 Prometheus scrape，而 scrape 端的認證設定
  是部署層的問題（綁內網介面或反向代理擋）。這個 change 只修「豁免範圍過寬」。

## Capabilities

### New Capabilities

- `platform-public-surface`：未認證可達的路徑有哪些、以什麼條件可達，
  以及新增這類路徑時的規則。

### Modified Capabilities

- `api-auth`：「登入」需求補上帳號鎖定的時效與到期後的計數處理。

## Impact

- **後端**：`PrismaAccountLockAdapter`、`LoginService`、`main.ts` 的 `mountSwagger`、
  `JwtAuthGuard`、`validate-env.ts`（兩個新變數 + 一個預設值修正）。
- **環境變數**：新增 `APPLICATION_ACCOUNT_LOCK_DURATION_MIN`、`SWAGGER_ENABLED`；
  `DB_PORT` 預設值改變（**已明確設定的環境不受影響**）。
- **無 migration**：`lockedAt` 欄位不變，只是開始被比對時效。
- **前端不受影響**。
- **`swagger:check` / api-client codegen 不受影響**：兩者走的是本機檔案而非 HTTP 端點，
  關掉 `SWAGGER_ENABLED` 不影響開發流程。
