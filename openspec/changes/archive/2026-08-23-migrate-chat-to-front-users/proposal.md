## Why

聊天領域裡的每一個「member」**指的從頭到尾都是前台使用者**，但它們現在全部指向
`members`——後台的管理員帳號表。也就是說現況是「**管理員彼此聊天，
用帳號管理去停權**」，而那不是這個產品要的東西。

`add-front-user-account`（3a）已經把 `users` 表與前台認證建好了，
但刻意沒有切換任何既有路徑——切換一旦開始就不能留半套狀態，
所以它自己就是一個 change。

**這不是「當初做錯了」的補救，是一個已知且已排程的切換。** 分表的決定發生在
聊天核心完成之後，而在那之前單表就是當時的設計。真正值得記下的教訓是
**做 M2 之前沒有先問「聊天的使用者是誰」**——那個問題如果早問，
分表會在第一天發生。

好消息是：這些欄位**全部沒有外鍵指向 `members`**（當初為了「帳號刪除不該由 DB 連動」
而刻意不建），所以遷移是**語意上的而非結構上的**——沒有外鍵要拆、沒有 cascade 要重接。

## What Changes

- **WS**：連線認證從 `ResolveMemberContextUseCase` 改為 `ResolveUserContextUseCase`；
  `AuthenticatedSocket` 帶的是 `UserContext`。
- **前台 HTTP**：`/api/front/chat-*` 三支 controller 從 `@CurrentMember()`
  改為 `@CurrentUser()`，並掛 `FrontJwtAuthGuard`。
- **後台審閱**：`findEmailsByIds` 的來源從 `LoadMemberPort` 改為 `LoadUserPort`
  （4 支 service）；成員概覽、房間成員、儀表板的成員數同理。
- **停權拆成兩支**：`SUSPEND_FRONT_USER_USE_CASE`（審閱側，停前台使用者）
  與既有的 `UPDATE_MEMBER_USE_CASE`（帳號管理側，停後台帳號）。
  兩者的撤銷連線也各自對應自己的側別。
- **資料**：既有的聊天資料**清空**（見 design.md D1）。

**不做**：

- **後台的前台使用者管理頁面**——那是 `add-admin-front-user-management`（路線圖第 5 項）。
  它會解除 `add-admin-member-profile` 的 D6 限制（「進入點只有檢舉」），
  但那個限制在本 change 之後仍然成立：沒有列表就只能從檢舉進去。
- **前台的註冊**——`add-front-user-registration`（3b），可與本 change 平行。
- **`members` 的任何欄位變動**。它仍然是後台帳號的表，只是不再被聊天引用。

## Capabilities

### Modified Capabilities

- `platform-websocket-transport`：連線認證的身分來源改為前台使用者。
- `api-moderation`：審閱看到的當事人來自 `users`；成員概覽是前台使用者的概覽。
- `api-account-suspension`：停權拆成兩個對象不同的動作。

## Impact

- **資料**：`chat_messages` / `chat_rooms` / `chat_room_members` / `chat_room_reads` /
  `chat_reports` / `chat_audit_logs` **全部清空**（見 design.md D1）。
  **需要使用者明確確認才執行。**
- **後端**：11 支 service（4 支審閱補 email、成員概覽、房間詳情、儀表板、
  停權相關）、3 支前台 controller、`ChatGateway`、
  `ChatWsModule` 與 `ModerationModule` 的相依。
- **presence**：key 的語意從「後台帳號」變成「前台使用者」。**格式不變**，
  但既有的 Redis 紀錄要清（`presence:member:*` 與 `presence:online-members`）。
- **測試**：所有聊天相關的 e2e 與整合測試改用 `seedUser` 而非 `seedMember`，
  並改用前台 token 連線。這是本 change 最大的一塊工作量。
- **無 migration**（沒有 schema 變動，只有資料清除）、**無新環境變數**。
- **前端**：`apps/web` 不受影響——審閱頁看到的仍然是 email，只是來源換了一張表。
