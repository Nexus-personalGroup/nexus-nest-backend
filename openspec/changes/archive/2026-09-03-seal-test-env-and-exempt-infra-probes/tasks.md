> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
>
> **驗證一律看 exit code**，且**指令不接 pipe**——`cmd | tail` 的退出碼是
> `tail` 的，前面炸掉會被吃掉（本專案 2026-09-03 踩過）。
> 用 `cmd > file 2>&1; echo "EXIT=$?"` 再從檔案 grep。
>
> 反向驗證要**兩邊都看**、並確認**紅的是哪一支**。
>
> **塊的依賴**：1 與 2 互不相依，可各自完成、各自 commit。
> 第 1 塊要先確認 e2e 在密封後不缺值（1.1），否則後面全部白做。
>
> **這個 change 沒有 schema、migration、新環境變數、API 契約、前端變更。**

## 1. e2e 密封：只取 DB 連線變數

- [x] 1.1 ⭐ **先確認密封不會缺值**：envSchema 的必填變數（無 `default`
      也無 `optional`）目前是 7 個，全部由 `applyE2EDbEnv`（`DB_*`）或
      `setup-env.e2e.ts` 覆蓋。**改之前重跑一次這個盤點**——
      有人新增必填變數的話，密封會讓 e2e 在 `getEnv()` 就炸
- [x] 1.2 `applyE2EDbEnv` 改用 `config({ path, processEnv: {} })`，
      只把 `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` /
      `DB_DATABASE` / `DB_TEST_DATABASE` 複製到 `process.env`
- [x] 1.3 ⭐ **維持「呼叫端的環境變數優先」**：只在 `process.env` 尚未有值時
      才從檔案補。順序反了 `verify:ci` 會連到開發庫，
      而 `DB_TEST_DATABASE` 的守門只檢查名稱含 `test`、不檢查主機——**錯誤是靜默的**
- [x] 1.4 修正該函式的 TSDoc：現在寫「載入真 `.env` 的連線帳密」，
      而實際行為是載入整份——**敘述與行為不符正是這個 bug 的溫床**
- [x] 1.5 `setup-env.e2e.ts` 的檔頭同步（它也寫著「先套 e2e DB 環境」）
- [x] 1.6 ⭐ **反向驗證密封有效**：在 `apps/api/.env` 設
      `APPLICATION_SESSION_IDLE_ENABLED=true` → e2e 仍 **417/417**。
      改之前這個情境是 183 failed，所以這一項是可構造的真實對照
- [x] 1.7 `pnpm verify:ci` 全綠（它走 host 跑測試那條路徑，
      是 1.3 的實際驗證）

## 2. 基礎設施探針豁免於 IP ACL

- [x] 2.1 新增「基礎設施探針」標記（decorator + metadata key），
      比照 `public.decorator.ts` 的形狀。⭐ **語意寫清楚**：
      判準是「這是不是給機器用的端點」，不是「需不需要認證」
- [x] 2.2 抽一個共用述詞判斷「這個請求是不是基礎設施端點」
      （標記 or 路徑清單），⭐ **讓「精確比對而非前綴」的推理只存在一處**
      ——目前那段推理寫在 `JwtAuthGuard` 的註解裡，只保護了那一支
- [x] 2.3 `IpWhitelistGuard` / `IpBlacklistGuard` 注入 `Reflector`，
      命中述詞即放行
- [x] 2.4 `HealthController` 掛上標記；`/api/metrics` 進顯式路徑清單並寫理由。
      ⚠️ **清單放在 `src/.../guard/infra-endpoint.ts`，不是 `allowlist.ts`**——
      提案原本寫後者，但那是測試樹，讓 production 的 guard 去 import
      會是反向相依。守則改為 import 該常數來檢查
- [x] 2.5 ⭐ **不得讓 IP guard 讀 `IS_PUBLIC_KEY`**——登入端點也是
      `@Public()`，那會讓黑名單對登入失效
- [x] 2.6 兩支 guard 的單元測試：標記過的路由不受旗標影響；
      **未標記的路由仍被擋**（缺這一半的話「全部放行」也會綠）

## 3. 守則

- [x] 3.1 守則：IP ACL 的豁免路徑清單每筆有理由，且路徑存在於實際路由
      （過期項目要紅）
- [x] 3.2 守則：IP guard 不得引用 `IS_PUBLIC_KEY`
- [x] 3.3 守則：`e2e-env.ts` 不得整份載入——⭐ **要能在有人把
      `processEnv` 拿掉時變紅**，別寫成「字串比對到就滿意」
- [x] 3.4 ⭐ 斷言掃描範圍有效（讀不到目標檔或清單為空要失敗）
- [x] 3.5 ⭐ **反向驗證三條規則**，每條都確認**紅的是哪一支**
- [x] 3.6 `openspec/project/testing.md` 的守則表補列

## 4. 收尾

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 4.2 `pnpm --filter @app/api test:e2e` 全綠——⭐ **這次不必再帶
      `APPLICATION_SESSION_IDLE_ENABLED=false`**，那正是本次要消除的東西
- [x] 4.3 實機：開 `APPLICATION_IP_WHITELIST_ENABLED=true`、白名單留空 →
      `pnpm docker:up` **五個容器仍全 Healthy**，後台頁面回 403
      （說得出原因的 403，不是整組起不來）
- [x] 4.4 `openspec validate seal-test-env-and-exempt-infra-probes --strict`
- [x] 4.5 `tasks/todo.md`：整體整理，並把
      「白名單啟用後沒有 UI 恢復路徑」記進待辦（design D4 的範圍外事項）
- [x] 4.6 `tasks/lessons.md`：本次的教訓在 #39 已記過三條，
      **只在有新東西時才補**——重複記錄會稀釋
- [ ] 4.7 `openspec archive seal-test-env-and-exempt-infra-probes`
