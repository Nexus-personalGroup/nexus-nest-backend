## Why

後台現在什麼都查得到，但**沒有任何地方回答「現在怎麼樣」**。

檢舉、成員、聊天室三個列表都是「去找特定的東西」，而營運每天要問的第一個問題是
「有沒有事」——現在線上多少人、有沒有累積的檢舉、訊息量是否異常。
這些目前只能下 SQL，或去看 Prometheus（而那是給機器看的，也沒有人天天開）。

首頁至今還是模板的「管理後台骨架已建立完成」佔位文字，
而它正是使用者登入後看到的第一個畫面。

## What Changes

- **後端**：新增 `GET /api/admin/moderation/dashboard`，回傳一組營運數字的快照——
  線上人數、待處理檢舉數、房間數、成員數、今日訊息數。需 `BACKEND:MODERATION:VIEW`。
- **後端**：新增 `GET /api/admin/moderation/dashboard/stream`（SSE），
  每 N 秒推送同一組快照。N 由環境變數決定。
- **Migration**：`chat_messages` 加 `createdAt` 索引——「今日訊息數」是全表掃描，
  而那是專案最大的一張表（見 design.md D3，含索引型別的選擇）。
- **前端**：新增 `/moderation/dashboard` 頁面，訂閱 SSE 顯示即時數字；
  「待處理檢舉數」可點，導向檢舉佇列。
- **前端**：Sidebar 加入「營運總覽」。

**不做**：

- **事件驅動的推播**。真即時要在每一則訊息、每一次連線上多做一份廣播——
  那是把儀表板的成本加到**聊天的熱路徑**上，而那是最不該被拖慢的地方。
  儀表板看的是聚合數字，晚 5 秒沒有差別。
- **歷史趨勢圖**。畫趨勢要有時序資料，而這個專案沒有存——
  Prometheus 有，但它是 scrape 模型、應用自己查不到歷史。
  真的要做應該接 Grafana 而不是在後台重畫一次。
- **今日訊息數以外的時間區間**（本週、本月）。多一個區間就多一次全表範圍掃描，
  而「今天」是唯一每天都會看的。

## Capabilities

### New Capabilities

- `api-dashboard`：營運快照的查詢與 SSE 推送契約。
- `ui-dashboard`：後台營運總覽頁的前端行為——訂閱、重連、數字呈現、權限顯示。

### Modified Capabilities

（無。既有的 `platform-observability` 管的是 Prometheus 與稽核，本 change 不動它們。）

## Impact

- **後端**：新增 `DashboardController`（SSE 端點的形狀與既有的 REST 不同，
  獨立成一支）、`GetDashboardSnapshotService`；
  `ChatReportRepositoryPort` 加「待處理計數」、
  `ChatMessageRepositoryPort` 加「某時間之後的計數」；
  房間數與成員數沿用既有的計數；線上人數沿用 `PresencePort`。
- **Migration**：`chat_messages` 新增 `createdAt` 索引（見 design.md D3）。
- **環境變數**：`DASHBOARD_STREAM_INTERVAL_SEC`（預設 5）。
- **前端**：新增 `apps/web/src/routes/moderation/dashboard/`，
  `App.tsx` 加一條路由、`_nav-items.ts` 加一筆。
- **api-client**：`schema.ts` 需重新產生（SSE 端點在 swagger 中以 `text/event-stream` 描述，
  api-client 不會為它產生可用的 hook——前端用原生 `EventSource`，見 design.md D5）。
