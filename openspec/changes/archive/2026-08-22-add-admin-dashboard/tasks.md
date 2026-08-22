> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由加 `pnpm --filter @app/api test:e2e`；動到 module 接線加 `pnpm build`；
> 動到 swagger yaml 加 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`。
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
> 跑單一測試檔：`cd apps/api && pnpm jest <path>`（**不要 `--filter`**）；
> 前端 `cd apps/web && pnpm test`（**不要 `pnpm test run`**）。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（migration）是塊 2 的前提——沒有索引「今日訊息數」跑得動但是全表掃描。
> 塊 2（快照）是塊 3（SSE）的前提：SSE 推的就是快照。
> 塊 5～6 是前端，塊 6 是這個 change **最容易做錯的一塊**（見 5.1 與 6.1）。
>
> **動工前先做的一件事**：把 `ui-dashboard` 要顯示的每一塊，
> 逐條對回 `api-dashboard` 的回應欄位（上上個 change 漏了這步，寫到前端才發現缺端點）。

## 1. Migration：訊息表的時間索引

- [x] 1.1 ⭐ `chat_messages` 加 `createdAt` 索引，**優先用 BRIN**
      （`@@index([createdAt], type: Brin)`）：這張表是 append-only 且 createdAt 單調遞增，
      物理順序與值天然相關——正是 BRIN 的適用條件，而它是專案**最大、寫最頻繁**的表
- [x] 1.2 ⭐ **實際驗證 Prisma 接受 `type: Brin`** —— **接受**。
      產出的 SQL 是 `CREATE INDEX ... USING BRIN ("created_at")`，
      `\d chat_messages` 也確認索引類型是 brin，不需要退回 B-tree
- [x] 1.3 用 `migrate dev --create-only` 產生 migration，確認 SQL 是預期的索引類型後再 `deploy`。
      **`///` 註解不會產生 `COMMENT ON`**，要的話手動補在 SQL 裡（已踩過兩次）
- [x] 1.4 驗證：`pnpm --filter @app/api db:generate && pnpm typecheck` 全綠

## 2. 後端：快照端點

- [x] 2.1 五個數字：線上人數（`PresencePort`）、待處理檢舉、房間數、成員數、今日訊息數
- [x] 2.2 ⭐ 今日的日界依 **`APP_TIMEZONE`**，不是 UTC——
      UTC 午夜對台灣是早上八點，用錯會讓「今日訊息數」在早上八點莫名其妙歸零。
      專案已有日期 helper（見 `openspec/project/backend-utilities.md`），**先找再寫**
- [x] 2.3 `ChatReportRepositoryPort` 加待處理計數（走 `idx_chat_reports_status_time`）；
      `ChatMessageRepositoryPort` 加「某時間之後的計數」
- [x] 2.4 ⭐ 回應**只有五個數字 + `generatedAt`**——不含訊息內容、email 或房間名稱。
      儀表板回答「現在怎麼樣」，任何具體識別資訊都該去對應的列表頁看
- [x] 2.5 本 service **不寫稽核**：不注入稽核 port，讓它在型別層面就不可能寫
- [x] 2.6 單元測試：五個數字齊全、空資料庫全為 0、
      **日界用 APP_TIMEZONE**（mock 一個跨 UTC 日界但在本地是今天的時間戳）
- [x] 2.7 驗證：`cd apps/api && pnpm test` 全綠

## 3. 後端：SSE 端點

- [x] 3.1 環境變數 `DASHBOARD_STREAM_INTERVAL_SEC`（預設 5）加進 `envSchema`
- [x] 3.2 ⭐ **一個實例只跑一個 interval**，查完廣播給該實例上所有訂閱者。
      寫成「每個連線各自 setInterval」是最直覺的實作，
      而它會讓 10 個管理員變成 10 倍的資料庫負載——那種放大在開發時看不出來
- [x] 3.3 ⭐ **沒有訂閱者時停掉 interval**。單元測試釘住這件事：
      它是這類實作最容易漏的一步，而漏了之後沒有任何症狀，只是一直打資料庫
- [x] 3.4 連線建立時**立即推一次**，不讓客戶端空等一個間隔
- [x] 3.5 單次查詢失敗 → 記錄錯誤、保持連線、下一週期重試。
      資料庫短暫不可用時把所有管理員踢下線，只會讓他們同時重連
- [x] 3.6 單元測試：多訂閱者共用一次查詢、最後一個離開後停止、查詢失敗不中斷
- [x] 3.7 驗證：`cd apps/api && pnpm test` 全綠、`pnpm build` 乾淨

## 4. Swagger、api-client 與後端 e2e

- [x] 4.1 兩支 yaml；SSE 那支用 `text/event-stream` 描述。
      **不要用 `allOf`**（已踩過）。
      **實作時補做**：`swagger-sync` 守則的掃描器只認
      `@Get|Post|Patch|Put|Delete`，**看不見 `@Sse()`**——SSE 端點對它完全隱形。
      已把 `Sse` 加進 `ROUTE_DECORATORS` 並映射成 GET，補完後它立刻抓到兩支缺 yaml
- [x] 4.2 `swagger:bundle` + `api-client generate`；**預期 api-client 不會為 SSE
      產出可用的 hook**，那是正常的——前端自己讀串流（見塊 6）
- [x] 4.3 e2e：快照回應的欄位鍵**完全等於**那六個——用 `Object.keys().sort()`，
      不要用 `objectContaining`（後者抓不到多回的欄位）
- [x] 4.4 e2e：空資料庫時五個數字皆為 0
- [x] 4.5 e2e：查快照不寫任何稽核
- [x] 4.6 e2e：只有 `ACCOUNT:VIEW` → 兩支都 403（SSE 那支 MUST NOT 建立串流）
- [x] 4.7 ⭐ e2e：今日訊息數**依 APP_TIMEZONE**——插一則 `createdAt` 落在
      UTC 昨天但本地今天的訊息，斷言它有被計入
- [x] 4.8 **反向驗證**：把日界改成 UTC → 4.7 要紅；快照多回一個欄位 → 4.3 要紅。
      兩者還原後都要綠
- [x] 4.9 驗證：`swagger:check` exit 0、`pnpm --filter @app/api test:e2e` exit 0

## 5. 前端：串流的讀取

- [x] 5.1 ⭐⭐ **不要用原生 `EventSource`**——它無法帶自訂 header，
      而本專案的 token 走 `Authorization: Bearer`。
      **更不要把 token 放 query string**：專案已明文禁止（query 會進日誌、
      瀏覽器歷史與 Referer）。用 `fetch` + `response.body.getReader()` 自行解析 `data:` 行
- [x] 5.2 ⭐ 重連要有**退避**：立刻重連在伺服器重啟期間會變成密集重試，
      而那正是伺服器最脆弱的時刻
- [x] 5.3 離開頁面時 `AbortController` 中止串流，不留背景連線
- [x] 5.4 解析邏輯做成**純函式**（吃一段文字、吐出完整的事件），單元測試涵蓋
      「一個 chunk 含多筆」與「一筆被切成兩個 chunk」——後者是串流解析最常見的錯
- [x] 5.5 驗證：`cd apps/web && pnpm test` 全綠

## 6. 前端：頁面

- [x] 6.1 ⭐⭐ **中斷時要看得出來**：顯示「連線中斷，重新連線中」，
      且數字改用可辨識為「非即時」的樣式。
      **這是這個頁面最重要的規則**——一個安靜地顯示 20 分鐘前數字的儀表板
      比沒有儀表板更糟，它讓人以為自己知道現況
- [x] 6.2 「最後更新於 X 秒前」，相對時間
- [x] 6.3 ⭐ **只有「待處理檢舉」可點**，導向 `/moderation/reports`。
      其餘四個不做成連結——每個數字都可點會讓真正該點的那個失去區別
- [x] 6.4 「今日訊息數」標明日界依系統時區
- [x] 6.5 `App.tsx` 加路由、`_nav-items.ts` 加一筆
      （`LayoutDashboard`、group「聊天管理」、`BACKEND:MODERATION:VIEW`）。
      **首頁不改成儀表板**：首頁對所有登入者開放，而營運數字需要 MODERATION:VIEW
- [x] 6.6 元件測試：中斷時顯示提示且數字有標示、只有檢舉數是連結、五個數字都渲染
- [x] 6.7 **反向驗證**：把 6.1 的中斷標示拿掉 → 對應測試紅；還原後綠
- [x] 6.8 驗證：`pnpm typecheck && pnpm lint && pnpm test:cov` 全綠

## 7. 收尾

- [x] 7.1 跑完整驗證鏈並貼出實際輸出（**exit code**），含 `test:e2e` 與 `build`
- [x] 7.2 `smoke-test.md`：**含兩項只有人工驗得到的**——
      (a) 開兩個分頁確認伺服器每週期只查一次（看後端 log 或 DB 查詢數）；
      (b) 把後端停掉，確認畫面顯示中斷而不是繼續顯示舊數字
- [x] 7.3 `.env.example` 的一行給使用者貼（`DASHBOARD_STREAM_INTERVAL_SEC=5`）
- [x] 7.4 `openspec/project.md` 與 `project/backend-runtime.md`：補上儀表板與 SSE 的取捨
- [x] 7.5 更新 `tasks/todo.md`：**M4 完成**
- [x] 7.6 新踩到的坑寫進 `tasks/lessons.md`（**沒踩到就不要硬寫**）
- [x] 7.7 `openspec archive add-admin-dashboard`
