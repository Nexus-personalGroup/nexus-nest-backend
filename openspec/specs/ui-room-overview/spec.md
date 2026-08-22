# ui-room-overview Specification

## Purpose
TBD - created by archiving change add-admin-room-overview. Update Purpose after archive.
## Requirements
### Requirement: 聊天室頁的路由與導航

`apps/web/` SHALL 提供 `/moderation/rooms`（列表）與 `/moderation/rooms/:roomId`（詳情）
兩條路由，並在 Sidebar 加入導向列表的選項。

- 兩條路由 MUST 受 `RequireAuth` 保護，未登入導向 `/login`。
- Sidebar MUST 新增「聊天室」項目，group 為「聊天管理」（與「檢舉審閱」同組），
  圖示使用 `lucide-react` 的 `MessagesSquare`。
- 使用者沒有 `BACKEND:MODERATION:VIEW` 權限時 MUST NOT 看到該項目；
  直接造訪任一路由 MUST 導向 `/`，且 MUST NOT 發出任何 API 請求。

**與成員概覽不同，聊天室 MUST 有 Sidebar 入口**：它有列表可以進入，
而「現在有多少房間」本身就是營運會直接問的問題。

#### Scenario: 從 Sidebar 進列表

- **WHEN** 有權限的使用者點「聊天室」
- **THEN** 導向 `/moderation/rooms`，渲染房間列表

#### Scenario: 無權限直接打 URL

- **WHEN** 沒有 `BACKEND:MODERATION:VIEW` 的使用者輸入該網址
- **THEN** 導向 `/`，不發出任何請求

### Requirement: 聊天室列表

`/moderation/rooms` SHALL 以 DataTable 顯示聊天室，**5 欄**：
名稱 / 類型 / 成員數 / 訊息量 / 建立時間。

- 「名稱」為 `null` 時 MUST 顯示「私聊」，MUST NOT 顯示空白。
- 「類型」MUST 轉成中文：`GROUP` → 群組、`DIRECT` → 私聊。
- 「訊息量」MUST 標明其語意是**歷史累計**（例如欄位標題或 tooltip），
  因為被撤回與被移除的訊息也計入——不標的話它會被誤讀成「現在有幾則」。
- 類型篩選 MUST 提供「全部 / 群組 / 私聊」三個值。
- 分頁與篩選狀態 MUST 同步到 URL query。
- 每一列 MUST 可點進該房間的詳情頁。

列表 MUST NOT 顯示任何訊息內容。

#### Scenario: 預設載入

- **WHEN** 使用者進入 `/moderation/rooms`
- **THEN** 顯示全部房間，依建立時間由新到舊

#### Scenario: 私聊的名稱

- **WHEN** 某列的 `name` 為 `null`
- **THEN** 顯示「私聊」

#### Scenario: 篩選群組

- **WHEN** 使用者切到「群組」
- **THEN** 重新查詢並把 `roomType=GROUP` 寫進 URL query

#### Scenario: 沒有任何房間

- **WHEN** 系統中沒有符合條件的房間
- **THEN** 顯示空狀態，MUST NOT 顯示錯誤

### Requirement: 聊天室詳情

`/moderation/rooms/:roomId` SHALL 顯示房間概覽與成員清單。

- 概覽區塊：名稱（私聊顯示「私聊」）、類型、成員數、訊息量、建立時間。
- 成員清單：每位顯示 email 與加入時間；email 為 `null` 時顯示「已刪除的帳號」與 id 尾碼。
- **每位成員 MUST 可點**，導向 `/moderation/members/<id>` 概覽頁。
- 房間不存在（`404`）時 MUST 顯示「聊天室不存在」與返回的方式，MUST NOT 空白畫面。
- 詳情頁 MUST NOT 顯示訊息，也 MUST NOT 提供任何前往訊息的入口。

#### Scenario: 檢視一個群組

- **WHEN** 管理員從列表點進某個群組
- **THEN** 顯示概覽與完整成員清單

#### Scenario: 從房間點進成員

- **WHEN** 管理員點成員清單中的某位
- **THEN** 導向該成員的概覽頁

#### Scenario: 成員的帳號已刪除

- **WHEN** 某位成員的 email 為 `null`
- **THEN** 顯示「已刪除的帳號」與 id 尾碼，該列仍可點進概覽頁

#### Scenario: 房間不存在

- **WHEN** 網址中的 `roomId` 查不到
- **THEN** 顯示「聊天室不存在」與返回方式

### Requirement: 三個實體之間的往返

檢舉、成員、聊天室三者 SHALL 互相連得起來。

- 成員概覽的聊天室清單，每一列 MUST 連往該房間的詳情頁。
- 房間詳情的成員清單，每一位 MUST 連往該成員的概覽頁。
- 檢舉詳情的當事人已連往成員概覽（既有）。

**動線的價值在完整**：少了任何一條，審閱者就會在某個點卡住而必須回頭重新搜尋。
單獨看每一條都只是「順手加個連結」。

#### Scenario: 從檢舉走到房間

- **WHEN** 管理員從檢舉詳情點被檢舉人、再從概覽點某個聊天室
- **THEN** 到達該房間的詳情頁，不需要中途回到任何列表

#### Scenario: 房間詳情不連往訊息

- **WHEN** 檢視房間詳情
- **THEN** 頁面上 MUST NOT 有任何前往訊息內容的連結或按鈕

