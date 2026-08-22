## Why

審閱動線還缺最後一個方向：**進不去房間本身**。

現在能從檢舉查到人（`add-admin-moderation-ui`），也能從人查到他的房間清單
（`add-admin-member-profile`）——但點不進去。看到「他在 5 個聊天室」之後，
下一個問題必然是「那些房間裡發生了什麼」，而目前沒有任何地方回答得了。

這也是後台唯一還看不到的一整類實體：帳號有列表、角色有列表、檢舉有佇列，
**聊天室沒有**。營運上很基本的問題——現在有多少房間、哪些是活躍的、
某個房間裡有誰——都要下 SQL 才知道。

## What Changes

- **後端**：新增 `GET /api/admin/moderation/rooms`，回傳聊天室列表——
  房間類型、名稱、成員數、訊息量、建立時間，可依類型篩選，分頁。
  需 `BACKEND:MODERATION:VIEW`。
- **後端**：新增 `GET /api/admin/moderation/rooms/:roomId`，回傳單一房間的概覽與成員清單。
- **前端**：新增 `/moderation/rooms` 列表頁與 `/moderation/rooms/:roomId` 詳情頁，
  Sidebar 加入「聊天室」項目。
- **前端**：成員概覽頁的聊天室清單改為可點，導向該房間的詳情頁。
- **前端**：房間詳情的成員清單可點，導向該成員的概覽頁——
  三個實體（檢舉 / 成員 / 房間）之間互相連得起來，才叫得上動線。

**不做**：

- **看房間裡的訊息**。那會開一條新的內容存取路徑，撞上
  `chat-message-single-entry.spec.ts` 的「訊息表只有一個入口」，
  需要新豁免、要寫稽核、還要決定被撤回／已移除的內容怎麼呈現。
  更重要的是它是**實質擴權**：從「有人檢舉才看得到那一句」變成「能瀏覽任何房間的對話」。
  要看內容仍然只能透過檢舉——那保持了「看內容必須有理由」。
- **任何處置動作**（踢出成員、解散房間）。總覽純粹回答「這個房間發生了什麼」；
  要處置就回到檢舉動線（移除訊息、停權人），不新增概念。
  「解散房間」還會撞上訊息保留策略——刪訊息會讓 `seq` 出現洞，而那一條還卡著。

## Capabilities

### New Capabilities

- `ui-room-overview`：後台聊天室總覽的前端行為——列表、詳情、
  與成員概覽之間的往返、權限驅動的顯示。

### Modified Capabilities

- `api-moderation`：新增聊天室列表與單一房間概覽兩個查詢端點。

## Impact

- **後端**：`ModerationController` / `ModerationFacade` 各加兩支；
  新增 `ListRoomsService` 與 `GetRoomDetailService`；
  `ChatRoomRepositoryPort` 加「列出全部房間」與「單一房間概覽」；
  成員清單的 email 沿用既有的 `LoadMemberPort.findEmailsByIds()`。
- **前端**：新增 `apps/web/src/routes/moderation/rooms/` 與 `room-detail/`，
  `App.tsx` 加兩條路由、`_nav-items.ts` 加一筆；
  成員概覽的 `MemberRoomsPanel` 每一列改為連結。
- **api-client**：`schema.ts` 需重新產生。
- **無 migration**：訊息量直接用 `chat_rooms.last_seq`（見 design.md D1），
  成員數沿用既有的計數方式，房間列表的排序成本見 design.md D4。
- **無新環境變數**。
