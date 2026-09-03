## Why

`improve-container-env-precedence`（#39）的實機驗收撈出兩個**既有**問題。
兩件都不是那支造成的，但形狀相同：**某個設定悄悄影響到不該影響的地方，
而失敗訊息指向別的方向**。

### ① 基礎設施探針被 IP 存取控制擋掉

`apps/api/.env` 開 `APPLICATION_IP_WHITELIST_ENABLED=true` 而 `ip_whitelist` 為空時，
guard 是 fail-closed，於是**每一個請求 403**——包含 `/api/health`。
後果是連鎖的：

```
/api/health 403  →  容器 healthcheck 失敗  →  api unhealthy
                 →  nginx 的 depends_on: service_healthy 永不滿足
                 →  整組容器起不來
```

而且**沒有恢復路徑**：能把自己 IP 加進白名單的後台 UI 自己也 403。

`HealthController` 已經標了 `@Public()` + `@SkipThrottle()`，看起來已經宣告
「我是基礎設施端點」。但 **`@Public()` 的語意只有「跳過認證」，
只有 `JwtAuthGuard` 會讀那個 metadata**；`IpWhitelistGuard` / `IpBlacklistGuard`
是各自獨立的全域 guard，完全不看。`/api/metrics` 同理——它是第三方 controller，
`JwtAuthGuard` 用精確路徑比對放行，但 IP guard 一樣擋得到。

**正式環境同形且更嚴重**：開白名單 → k8s liveness probe 403 → CrashLoopBackOff。
探針來自叢集內部，它的來源 IP 不會在為外部使用者設計的白名單裡。

### ② e2e 會載入開發者整份 `.env`

`test/helpers/e2e-env.ts` 的 `config({ path: apps/api/.env })` 載入的是
**整份檔案**——該函式的 TSDoc 寫「載入真 `.env` 的連線帳密」，不準確。
於是開發者所有的功能開關都進了測試的 `process.env`。

實測（同一份程式碼、同一條指令）：

| `APPLICATION_SESSION_IDLE_ENABLED` | 結果 |
| --- | --- |
| `true`（來自本機 `.env`） | **183 failed / 234 passed** |
| 強制 `false` | **417 passed** |

失敗訊息是「Session 已因閒置過久而過期，請重新登入」，
登入本身回 200、下一個請求才 401——**指不到真正的原因**。

**CI 永遠是綠的**，因為 CI 沒有 `apps/api/.env`，dotenv 靜默 no-op，
旗標走 envSchema 預設（`false`）。這類問題**只會在有設定的那台機器上出現，
而 CI 定義上就是沒設定的那台**——所以它躲過了 39 支 PR。

`pnpm verify:ci` 同樣會中：它是「host 跑測試 + 容器只提供 tmpfs 資料庫」，
`verify-ci.sh` 只覆寫 `DB_*`。對照組是 `--profile e2e`（`pnpm test:e2e:docker`），
那條路徑的服務沒有 `env_file`、容器內 `.env` 又被遮蔽，**是密封的**。
兩條路徑對同一件事有兩種答案，本身就是缺陷。

## What Changes

- **新增一個「基礎設施探針」標記**，兩支 IP guard 讀它就放行；
  `HealthController` 掛上該標記，`/api/metrics` 走具理由的路徑豁免清單。
  ⚠️ **不讓 IP guard 認 `@Public()`**——登入／註冊也是 `@Public()`，
  而擋惡意 IP 打登入正是黑名單存在的意義。
- **`applyE2EDbEnv` 改為只取 DB 連線變數**：用 dotenv 的 `processEnv` 選項
  把檔案解析到暫存物件，只複製 `DB_*` 到 `process.env`，其餘一律丟棄。
  已確認 envSchema 的 7 個必填變數全部由 `applyE2EDbEnv` 或
  `setup-env.e2e.ts` 覆蓋，密封不會缺值。
- **修正該函式的 TSDoc**——「載入連線帳密」與實際行為不符正是這個 bug 的溫床。
- **兩條新守則**：IP guard 的豁免必須是顯式清單且寫理由；
  e2e 的環境設定不得整份載入 `.env`。

## Capabilities

### Modified Capabilities

- `platform-public-surface`：新增「基礎設施探針必須豁免於 IP 存取控制」。
  該 capability 的判準本來就是「**豁免必須跟著它的理由走，範圍要寫得比理由更窄**」
  ——這條需求正是它的另一面：**閘門的範圍也要比它的理由更窄**。
- `platform-ci-quality-gate`：新增「測試環境的設定必須密封」。
  該 capability 的存在理由是「CI 是把關的最後一道」，
  而本次的缺陷讓「本機綠」與「CI 綠」代表不同的事，直接侵蝕那個保證。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | 無新增 |
| API 契約 / Swagger | 無 |
| 前端 | 無 |
| 行為變更 | 開啟 IP 白名單時，`/api/health` 與 `/api/metrics` **不再被擋**；本機 e2e 不再受 `apps/api/.env` 的功能開關影響 |

⚠️ **①是刻意讓兩個端點不受 IP ACL 保護**。理由是它們本來就是
`platform-public-surface` 已列管的免認證路徑，而把 liveness 探針放進
「為外部使用者設計的存取控制」之下，換來的不是安全而是**服務停擺**。
需要限制探針來源時，正確的位置是網路層（nginx / k8s NetworkPolicy），
不是應用層的使用者 ACL——這一點寫進需求，避免之後有人「補強」回來。
