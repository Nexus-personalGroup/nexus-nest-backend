## ADDED Requirements

### Requirement: 營運總覽的路由與導航

`apps/web/` SHALL 提供 `/moderation/dashboard` 營運總覽頁，並在 Sidebar 加入入口。

- 路由 MUST 受 `RequireAuth` 保護，未登入導向 `/login`。
- Sidebar MUST 新增「營運總覽」，group 為「聊天管理」，
  圖示使用 `lucide-react` 的 `LayoutDashboard`。
- 沒有 `BACKEND:MODERATION:VIEW` 的使用者 MUST NOT 看到該項目；
  直接造訪 MUST 導向 `/`，且 MUST NOT 建立任何連線。

首頁（`/`）MUST NOT 改成儀表板：首頁對所有登入者開放，
而營運數字需要 `MODERATION:VIEW`——把它放上去等於讓半數使用者看到一片空白或錯誤。

#### Scenario: 有權限的使用者進入

- **WHEN** 使用者點 Sidebar 的「營運總覽」
- **THEN** 導向 `/moderation/dashboard` 並開始接收數字

#### Scenario: 無權限直接打 URL

- **WHEN** 沒有 `BACKEND:MODERATION:VIEW` 的使用者輸入該網址
- **THEN** 導向 `/`，MUST NOT 發出請求或建立串流

### Requirement: 數字的呈現

總覽頁 SHALL 顯示五個數字：線上人數、待處理檢舉、聊天室數、成員數、今日訊息數。

- **「待處理檢舉」MUST 可點**，導向 `/moderation/reports`。
  五個數字裡只有它是要人採取行動的——讓「看到有 3 筆」與「開始處理」之間沒有中斷。
- 其餘四個 MUST NOT 做成連結：它們是狀態不是待辦，
  每個數字都可點會讓真正該點的那個失去區別。
- 「今日訊息數」MUST 標明其日界依系統時區（`APP_TIMEZONE`）而非 UTC。
- 頁面 MUST 顯示「最後更新於」，以相對時間呈現（例如「3 秒前」）。

#### Scenario: 首次載入

- **WHEN** 頁面開啟並成功建立串流
- **THEN** 立即顯示第一組數字，不停留在載入狀態等一個間隔

#### Scenario: 點待處理檢舉

- **WHEN** 管理員點「待處理檢舉」的數字
- **THEN** 導向 `/moderation/reports`

#### Scenario: 系統中沒有資料

- **WHEN** 所有數字為 0
- **THEN** 顯示 `0` 而非空白或載入中

### Requirement: 串流的連線與重連

總覽頁 SHALL 以帶 `Authorization` header 的串流讀取數字。

- **MUST NOT 使用原生 `EventSource`**：它無法帶自訂 header，
  而本專案的 token 以 `Authorization: Bearer` 傳送。
  **MUST NOT 改用 query string 傳 token**——query 會進伺服器日誌、
  瀏覽器歷史與 `Referer`，專案已明文禁止。
  正確做法是 `fetch` + `response.body.getReader()` 自行解析。
- 連線中斷時 MUST 自動重連，且 MUST 有**退避**：
  立刻重連在伺服器重啟期間會變成密集重試，而那正是伺服器最脆弱的時刻。
- 離開頁面時 MUST 中止串流，MUST NOT 留下背景連線。

#### Scenario: 伺服器重啟

- **WHEN** 串流中斷
- **THEN** 前端以退避策略重連，不是固定間隔的密集重試

#### Scenario: 離開頁面

- **WHEN** 使用者導航到其他頁面
- **THEN** 串流 MUST 被中止

### Requirement: 過期的資料要看得出來是過期的

串流中斷期間，頁面 MUST 明確標示連線狀態。

- 中斷時 MUST 顯示「連線中斷，重新連線中」。
- 中斷時 MUST NOT 繼續以正常樣式顯示最後收到的數字——
  一個停在 20 分鐘前的數字看起來與即時數字一模一樣，而營運會依它做判斷。
- 重連成功後 MUST 恢復正常樣式。

**這一條是這個頁面最重要的規則。** 儀表板的價值完全建立在「數字是現在的」之上；
一個安靜地顯示舊數字的儀表板比沒有儀表板更糟——它讓人以為自己知道現況。

#### Scenario: 連線中斷

- **WHEN** 串流斷開且尚未重連成功
- **THEN** 顯示中斷提示，且數字以可辨識為「非即時」的樣式呈現

#### Scenario: 重連成功

- **WHEN** 串流恢復並收到新的快照
- **THEN** 中斷提示消失，數字恢復正常樣式，「最後更新於」重新計時
