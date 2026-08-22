> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由加 `pnpm --filter @app/api test:e2e`；動到 module 接線加 `pnpm build`。
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
> 跑單一測試檔：`cd apps/api && pnpm jest <path>`（**不要 `--filter`**）。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 四塊在程式碼上互相獨立，可依任意順序做。放在同一個 change 的理由是
> 驗證方式相同（都要用未認證身分去打），不是實作有關聯。
> 塊 5 的守則涵蓋塊 2 與塊 3 的成果，必須在它們之後。
>
> **本 change 沒有 migration**。`lockedAt` 欄位不變，只是開始被比對時效。

## 1. 帳號鎖定加時效

- [x] 1.1 `APPLICATION_ACCOUNT_LOCK_DURATION_MIN`（預設 15）加進 `envSchema`
- [x] 1.2 ⭐ ~~`isLocked` 改為比對時效~~ **改名為 `checkLock()` 並回三態**
      （`NONE` / `LOCKED` / `EXPIRED`）：布林分不出「從未鎖定」與「鎖過但已到期」，
      而 1.3 的清除只在後者發生。三態讓呼叫端在型別層面就得面對 EXPIRED。
      **另外修掉一個 spec 漂移**：`LoginService` 丟的是 `ForbiddenException`（403），
      而 spec 寫的是 `423` + `ACCOUNT_LOCKED`——`AccountLockedException` 一直存在沒被用，
      而既有的單元測試斷言的正是 403，把漂移一起釘住了。
      **`isLocked` 不得有副作用**——一個叫 `isLocked` 的方法偷偷做寫入，
      是下一個人絕對不會預期的事
- [x] 1.3 ⭐⭐ **到期時一併清除失敗計數**。Redis 計數器 TTL 是 1800 秒（30 分鐘），
      比預設時效（15 分鐘）長：只判定到期而不清計數的話，使用者在到期後
      第一次打錯就會因為「計數還在閾值上」立刻重新被鎖，**實際鎖定時間變成計數的 TTL
      而非設定的時效**——而設定的那個數字看起來完全正常。
      做法是 `LoginService` 確認已到期時呼叫 `resetFailedLogin(email)` 再繼續
- [x] 1.4 單元測試：未到期→仍鎖定、已到期→不鎖定、到期時有呼叫 `resetFailedLogin`、
      `lockedAt` 為 null→不鎖定
- [x] 1.5 ⭐ 單元測試釘住「`isLocked` 沒有副作用」：呼叫它之後
      mock 的寫入方法 MUST NOT 被呼叫
- [x] 1.6 驗證：`cd apps/api && pnpm test` 全綠

## 2. Swagger 開關

- [x] 2.1 `SWAGGER_ENABLED` 加進 `envSchema`，**預設值依 `NODE_ENV`**：
      production 為 false、其餘為 true。
      `validate-env.ts` 已有依環境調整的先例，**先找再寫**
- [x] 2.2 ⭐ 關閉時 `/docs` 與 `/docs-json` **兩者都不掛載**。
      只關 UI 是最容易犯的錯——`docs-json` 才是有價值的那份，而它沒有介面所以不顯眼
- [x] 2.3 ~~e2e：`SWAGGER_ENABLED=false` 時兩條路徑都回 404~~ **改為單元測試**：
      `mountSwagger` 在 `main.ts` 的 bootstrap 裡（`app.use()` 的原生 middleware），
      而 e2e 的 `createE2EApp` 根本不會走到那段——那條路徑 e2e 測不到。
      改測 `resolveSwaggerEnabled()` 這支純函式（決定），掛載本身進 smoke-test（行為）
- [x] 2.4 ⭐ 驗證 `swagger:check` 與 api-client codegen **不受影響**——
      它們走本機檔案而非 HTTP 端點。實際跑一次確認，不要用推論的
- [x] 2.5 驗證：`pnpm --filter @app/api test:e2e` exit 0

## 3. `/api/metrics` 的豁免收窄

- [x] 3.1 ⭐ `startsWith('/api/metrics')` → 精確比對，且 **MUST 去除 query string**
      （`/api/metrics?foo=1` 也要能通過，否則 Prometheus 帶參數時會壞）
- [x] 3.2 單元測試：`/api/metrics` 通過、`/api/metrics?x=1` 通過、
      **`/api/metrics-secret` 不通過**（這支是這一塊的重點）
- [x] 3.3 驗證：`cd apps/api && pnpm test` 全綠

## 4. `DB_PORT` 預設值修正

- [x] 4.1 `DB_PORT` 的 `.default(3306)` → `.default(5432)`。
      3306 是 MySQL 的埠，模板時期的遺留；本專案是 PostgreSQL
- [x] 4.2 確認**沒有任何地方依賴舊的預設值**：`.env`（5442）、
      `compose.yml`（5432）、e2e setup 都有明確設定，改預設值不影響它們
- [x] 4.3 驗證：`pnpm --filter @app/api test:e2e` 與 `test:integration` 都跑一次——
      這兩者連的是真實資料庫，是唯一會因為埠錯而壞掉的地方

## 5. 守則：未認證可達的表面

- [x] 5.1 ⭐ 新增 `public-surface.spec.ts`：
      (a) `JwtAuthGuard` 內的路徑豁免不得用 `startsWith` 或前綴正規式；
      (b) `main.ts` 的 `app.use('<path>', ...)` 掛載路徑必須列入 allowlist 並註明理由
- [x] 5.2 ⭐ **合成輸入自我測試**：用 `startsWith` 的豁免 → 抓出；
      精確比對 → 通過；未列入 allowlist 的 `app.use` → 抓出。
      給出偽陰性的守則比沒有守則更危險——它會讓人停止人工檢查
- [x] 5.3 「掃描範圍有效」測試：掃到 0 個 `app.use` 掛載代表解析失效，規則會空轉
- [x] 5.4 ⭐ **反向驗證**：把 3.1 改回 `startsWith` → 守則要紅；還原後綠
- [x] 5.5 驗證：`pnpm --filter @app/api test:arch` exit 0

## 6. env 三方同步守則

- [x] 6.1 `env-schema.spec.ts` 補三條斷言：`.env.example` 的 key 集合 ⊇ envSchema、
      `compose.yml` 注入的 key ⊆ envSchema（`VITE_` / `TSC_` 除外）、
      `docker/api.container.env` 的 key ⊆ envSchema
- [x] 6.2 ⭐ **反向驗證**：從 `.env.example` 拿掉一個變數 → 守則要紅。
      這條守則存在的理由就是它——`WS_CONNECTION_EVENT_*` 加進 schema 之後
      三週都沒有進 `.env.example`，而沒有任何東西會提醒
- [x] 6.3 驗證：`pnpm --filter @app/api test:arch` exit 0

## 7. 收尾

- [x] 7.1 跑完整驗證鏈並貼出實際輸出（**exit code**），含 `test:e2e`、`test:integration`、`build`
- [x] 7.2 `smoke-test.md`：**含一項只有人工驗得到的**——
      用錯密碼把測試帳號鎖住，等時效過後確認**不需要任何人介入就能登入**
- [x] 7.3 `.env.example` 與 `docker/api.container.env` 的新變數（給使用者貼）
- [x] 7.4 `openspec/project/backend-runtime.md`：補上帳號鎖定的時效與 Swagger 開關
- [x] 7.5 更新 `tasks/todo.md`：**整份重排**——分表決定讓「附件訊息」與「訊息保留」
      的前提都變了，現有的待辦區塊已與現實脫節
- [x] 7.6 新踩到的坑寫進 `tasks/lessons.md`（**沒踩到就不要硬寫**）
- [x] 7.7 `openspec archive fix-unauthenticated-surface`
