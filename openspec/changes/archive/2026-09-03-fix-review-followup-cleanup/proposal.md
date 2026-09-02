## Why

2026-09-03 審查報告的六個小項，全部是**文件與設定層級**，報告自己建議併成一支。
它們的共同點是「**已經做對的判斷沒有寫在會被讀到的地方**」——
沒有一個是行為缺陷，但每一個都會讓下一個人推論錯誤。

- **問題 3**：兩處註解點名了**不存在的守則檔名**。保護是真的
  （`permission-catalog-sync.spec.ts` 裡兩條規則都在），只有指路是假的。
  審查者就是因此以為防護不存在，把整支守則讀完才確定。
- **問題 5**：Swagger 關閉時開機日誌仍印出兩行文件網址（上一輪的 🟢 7，未動）。
- **問題 2**：nginx 的 `Connection "upgrade"` 是寫死的字面值，
  標準寫法要跟著 `$http_upgrade` 走。**現在潛伏**——兩個 upstream 都沒有
  `keepalive`，哪天有人為了效能加上，它會安靜地不生效。
- **問題 6**：nginx 檔頭寫了「加後端路由前先確認落在 `/api` 或 `/socket.io` 底下」，
  那句管的是**別漏掛**；缺的是反向那半句——**哪些不該從外面進來**。
- **觀察 B / D**：三次「測試綠但沒驗到」的解法都收斂到同一招（讀原始碼字面值的守則），
  但那一招的**守備範圍沒有寫下來**；以及「`pnpm build` 綠不代表 DI 組得起來」
  已經踩過兩次，仍只存在於 lessons。

順帶補一個審查報告沒提、但同一類的東西：**`postgres-verify` 的對外埠 `15432`
是寫死的**，而其他三個對外埠都可用根目錄 `.env` 覆寫。

## What Changes

- **修正兩處守則檔名**（`unassignable-permissions.ts` / `permission-labels.ts`
  → `permission-catalog-sync.spec.ts`）。
- **Swagger 開機日誌包進 `if (isSwaggerEnabled())`**。
- **nginx 改用 `map $http_upgrade $connection_upgrade`**，三個 `location` 一起。
- **nginx 檔頭補上「哪些不該從外面進來」**（`/api/metrics` 與 `/api/*/docs`）。
- **`testing.md` 補兩節**：兩種守則手段各自的守備範圍；
  「build 綠 ≠ DI 組得起來，動模組接線必跑 e2e」。
- **`postgres-verify` 的埠改成 `${VERIFY_DB_PORT:-15432}`**，
  compose 與 `scripts/verify-ci.sh` 兩處同步；並新增根目錄的 `.env.example`
  （目前不存在，於是「有哪些可以調」只能去讀 compose.yml）。

**不做**：審查報告的問題 1（營運快照的無界 `COUNT(*)`）——
報告自己說「不要在還沒量之前就選方案」，它需要先加觀測，是另一支 change。
問題 4（`lastSeenAt` 當連線年齡的代理）報告判定「實務上可以不管」，只需一行註解，
已併入本支的 nginx／守則註解那一塊之外**單獨處理**（見 tasks 1.5）。

## Capabilities

### Modified Capabilities

- `platform-container-dev`：新增三條——「代理的 upgrade 標頭必須是條件式」、
  「代理設定必須寫明哪些路徑不該對外」、「所有對外埠都必須可由根目錄環境檔覆寫」。
  **不改既有的「反向代理必須是單一入口」那條**：它講的是拓撲，這三條講的是
  設定的正確性與可讀性，混進去會讓那條變成什麼都管。
- `platform-engineering-guardrails`：新增「守則手段的守備範圍必須寫下來」。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | **新增 `VERIFY_DB_PORT`**（compose 用，不經 `envSchema`），有預設值 |
| API 契約 / Swagger | 無 |
| 前端 | 無（只改兩行註解） |
| 行為變更 | **Swagger 關閉時不再印出文件網址**；nginx 的 `Connection` 改為條件式 |
