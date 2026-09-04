> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
>
> **驗證一律看 exit code**，且**指令不接 pipe**——`cmd | tail` 的退出碼是 `tail` 的。
> 用 `cmd > file 2>&1; echo "EXIT=$?"` 再從檔案 grep。
>
> 反向驗證要**兩邊都看**、並確認**紅的是哪一支**。
>
> **三塊互不相依**，可各自完成、各自 commit、各自回退。
>
> **這個 change 沒有 schema、migration、新環境變數、API 契約、前端變更。**

## 1. 營運快照的查詢成本可觀測

- [x] 1.1 `MetricsPort` 加 `observeDashboardQuerySeconds(query, seconds)`，
      `query` 是**封閉集合的 union 型別**（五個查詢名）
      ——⭐ 標籤不得是無界的值，這是該 port 既有的約束
- [x] 1.2 `PrometheusMetricsAdapter` 加對應直方圖 + `METRIC_NAMES` 補一筆；
      `NoopMetricsAdapter` 補同名方法（指標關閉時零成本）
- [x] 1.3 ⭐ `GetDashboardSnapshotService` **逐個查詢**量測，不是量總耗時
      ——總耗時說得出「慢」，說不出「該修哪一個」。
      `Promise.all` 的併發要保留，每個 promise 各自包量測
- [x] 1.4 單元測試：五個查詢各回報一次，且 query 名稱正確；
      ⭐ 補一條「某個查詢拋錯時不影響其他四個的量測語意」
- [x] 1.5 ⭐ **不改任何索引、不加任何快取**——本塊只讓它可測量。
      修法要等指標有資料之後再選（design D1）

## 2. master spec 的 requirement 開頭表態

- [x] 2.1 ⭐ 先確認診斷：openspec 的 validator 取 requirement 開頭段落的
      **第一行**當 `text`。用 `openspec show <spec> --type spec --json`
      看它實際讀到什麼，**別憑錯誤訊息猜**
- [x] 2.2 改七處（純排版，語意不變）：
      `api-auth` #6 / `api-front-auth` #10 / `api-user-management` #3 /
      `platform-observability` #4 / `platform-token-scope` #1 /
      `ui-member-profile` #3 / `ui-moderation` #3
- [x] 2.3 ⭐ **逐條確認語意沒變**：改完之後每一句話都還在，只是順序或斷行不同。
      動到「規定了什麼」就必須改走 delta spec（design D2）
- [x] 2.4 守則加進既有的 `openspec-spec-format.spec.ts`：
      每個 requirement 開頭段落第一行必須含 `SHALL` 或 `MUST`
      ——⭐ `MAY` **不算**（`platform-token-scope` #1 就是這個形狀，實際踩到）
- [x] 2.5 ⭐ 斷言掃描範圍有效（讀不到 spec 或讀不到 requirement 要紅）
- [x] 2.6 ⭐ **反向驗證**：把某條 requirement 的關鍵字挪到第二行 → 紅，
      且確認紅的是這一支；還原 → 綠
- [x] 2.7 `openspec validate --specs --strict` **exit 0**（七支全綠）
- [x] 2.8 `verify:ci` 加一步 `openspec validate --specs --strict`
      ——守則只涵蓋這一條規則，這一步是接住 openspec 未來新增規則的網

## 3. IP 白名單的徵兆與恢復路徑

- [x] 3.1 啟動時檢查「白名單啟用 + 清單為空」→ 記 **error** 層級日誌，
      內容要寫**後果**（所有使用者流量將被拒）與**恢復方式**
- [x] 3.2 ⭐ 只在啟動時查一次——這是設定錯誤不是執行期狀態。
      代價（執行期刪掉最後一筆不會有新日誌）已寫進需求，不假裝涵蓋
- [x] 3.3 恢復指令：新增一筆白名單項目，供被鎖在外面時恢復。
      ⚠️ **做成 script（`pnpm --filter @app/api ip:allow <IP>`）而非 seed**——
      提案原本寫 seed，但 seed 每次 `db:seed` 都會跑，而「要放行哪個 IP」
      是因機器而異的**參數**，不是可以寫死的初始資料
- [x] 3.4 ⭐ **不得改成「清單為空就放行」**，也不得自動放行 loopback／私有網段
      ——那讓開關形同虛設，且隱形豁免違反本專案對豁免的判準
- [x] 3.5 單元測試三態：啟用且空 → 記錄；啟用且非空 → 不記錄；
      關閉 → **完全不查清單**（缺最後一態的話「一律查」也會綠）
- [x] 3.6 實機：白名單開啟且清單為空 → 啟動日誌有那一行 error、
      五個容器仍全 Healthy；用 seed 加一筆後該來源可存取

## 4. 收尾

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 4.2 `pnpm --filter @app/api test:e2e` 全綠
- [x] 4.3 `openspec validate fix-todo-backlog-cleanup --strict`
- [ ] 4.4 `tasks/todo.md`：整體整理——三項都要從「可以直接動」移走，
      ①要留下「指標已就位，下次看數據再選修法」
- [ ] 4.5 `tasks/lessons.md`：只在有新東西時才補
      （openspec validator 只讀第一行這件事值得記）
- [ ] 4.6 `openspec archive fix-todo-backlog-cleanup`
