## Context

兩個問題都由 #39 的實機驗收撈出，都是既有缺陷。合成一支是因為
**它們的根因是同一種錯誤**：一個機制的作用範圍被寫得比它的理由更寬，
而超出的那部分沒有任何徵兆。

- IP ACL 的理由是「限制**使用者**從哪些位址存取後台」，
  但它的作用範圍是「**每一個 HTTP 請求**」，於是涵蓋了 liveness 探針。
- `applyE2EDbEnv` 的理由是「e2e 要用開發者本機的 DB 帳密」，
  但它的作用範圍是「**整份 `.env`**」，於是涵蓋了所有功能開關。

## Goals / Non-Goals

**Goals:**

- 開啟 IP 白名單 MUST NOT 讓服務無法通過健康檢查。
- 本機 e2e 的結果 MUST NOT 取決於未進版控的檔案。
- 兩者都要有守則守住，而不是靠註解提醒。

**Non-Goals:**

- **不改 IP guard 的 fail-closed 行為**。空白名單全鎖死是正確的安全姿態，
  問題不在那裡（見 D4）。
- **不動 `@Public()` 的語意**，也不讓 IP guard 讀它（見 D1）。
- 不處理容器化 e2e（`--profile e2e`）——它本來就是密封的，是本次的對照組。
- 不新增環境變數、不改任何旗標的預設值。

## Decisions

### D1：不讓 IP guard 認 `@Public()`，要一個更窄的標記

最省事的做法是讓兩支 IP guard 也讀 `IS_PUBLIC_KEY`。**不採用**：

`@Public()` 目前掛在 login / refresh / forgot / reset / health 上。
其中**登入端點正是 IP 黑名單最需要擋的地方**——擋惡意來源打登入是這個功能
存在的主要理由。讓 IP guard 認 `@Public()` 等於把黑名單對登入失效，
**用一個安全缺陷換掉一個可用性缺陷**。

所以要的是一個語意更窄的標記：**「這是基礎設施探針，不是使用者流量」**。
它與 `@Public()` 的差別是判準不同——`@Public()` 問「需不需要身分」，
新標記問「這是不是給機器用的健康／指標端點」。
兩者剛好都落在 `HealthController` 上是巧合，不是同一件事。

這與 `platform-public-surface` 既有的判準一致：
**豁免的範圍要寫得比理由更窄**。

### D2：`/api/metrics` 走路徑豁免清單，與既有做法對齊

`/api/metrics` 由第三方 controller 提供，掛不上裝飾器——`JwtAuthGuard`
已經為此用**精確路徑比對**（去 query string，不用 `startsWith`）放行。
IP guard 沿用同一個形狀，並把路徑放進 `allowlist.ts` 的顯式清單、每筆寫理由，
與 `PUBLIC_MOUNT_EXEMPTIONS` / `SWAGGER_EXEMPT_ROUTES` 的既有慣例一致。

**不把判斷直接複製到三支 guard**：抽一個共用的述詞
（「這個請求是不是基礎設施端點」），讓「精確比對而非前綴」這個推理只存在一處。
現在 `JwtAuthGuard` 裡那段註解寫得很好，但它只保護了那一支 guard。

### D3：e2e 用 dotenv 的 `processEnv` 精確取值，而不是「載入後再蓋掉」

三種做法：

| 做法 | 問題 |
| --- | --- |
| 在 `setup-env.e2e.ts` 逐一把功能開關設成 `false` | **清單會過期**——新增旗標時沒有東西提醒你補。這正是「已知缺口靠記憶維護」的形狀 |
| 載入後刪掉不要的 key | 要維護一份「不要的」清單，比上面更糟：預設是洩漏 |
| **解析到暫存物件，只複製要的 key** | 預設是密封，新增旗標不需要改動任何東西 ✅ |

dotenv 17.4.2 支援 `config({ processEnv: {} })`——解析結果寫進給定物件而不碰
`process.env`。取 `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` /
`DB_DATABASE` / `DB_TEST_DATABASE` 六個即可。

**已驗證密封不會缺值**：envSchema 有 7 個必填變數（無 `default` 也無 `optional`），
全部由 `applyE2EDbEnv`（`DB_*`）或 `setup-env.e2e.ts`（三個 secret +
`AWS_MEDIA_LIBRARY_ROOT`）覆蓋。

**必須保留 shell 優先**：`verify-ci.sh` 以環境變數傳 `DB_*`，
現行的 dotenv 語意是「不覆寫既有的 `process.env`」。改寫後要顯式維持這個順序，
否則 `verify:ci` 會連到開發庫而不是 tmpfs 庫——**而那個錯誤會是靜默的**
（`DB_TEST_DATABASE` 的守門只檢查名稱含 `test`，不檢查是哪一台）。

### D4：不改 fail-closed，因為問題不在那裡

「空白名單 = 全鎖死」看起來像個 bug，但**開啟白名單卻允許未列名的來源
才是真正的 bug**。fail-closed 是對的。

真正的缺陷是**探針被算進「來源」**。修好之後，
空白名單仍然鎖死所有使用者流量（正確），但服務能通過健康檢查、
容器起得來、後台會回一個說得出原因的 403。

⚠️ 那時仍然沒有「從 UI 把自己加進白名單」的路徑——這是 fail-closed 的固有代價，
**不在本次範圍**。真要處理的方向是啟用時要求至少一筆白名單，
或提供 CLI/seed 入口；記進 `tasks/todo.md`，不順手做。

### D5：守則盯「豁免有沒有理由」與「有沒有整份載入」

兩條規則都只能檢查形狀，不能檢查判斷是否正確：

- IP ACL 豁免：清單非空、每筆有理由、路徑存在於路由中。
- e2e 密封：`e2e-env.ts` 不得出現「把 dotenv 結果寫進 `process.env`」的形狀。

第二條的實作要小心**別寫成字串比對就滿意**——規則要能在
「有人把 `processEnv` 拿掉」時變紅。反向驗證時要確認紅的是這一支。

## Risks / Trade-offs

- **探針不再受 IP ACL 保護**。`/api/health` 只回存活與依賴狀態，
  `/api/metrics` 會洩漏流量與房間規模的量級資訊。
  代價是知情的：`platform-public-surface` 已經把兩者列為免認證路徑，
  真正的邊界應該在網路層。**已寫進需求**，避免之後有人「補強」回來。
- **e2e 密封後，開發者無法再靠 `.env` 調整測試行為**。那正是目的；
  真要調整就在 spec 裡顯式覆寫，那樣下一個人讀得到。
- **`processEnv` 是 dotenv 16.4+ 的 API**。本專案 17.4.2，但降版會靜默失效
  （選項被忽略 → 回到整份載入）。守則盯的是程式碼形狀，涵蓋得到這個情況。

## Open Questions

無。
