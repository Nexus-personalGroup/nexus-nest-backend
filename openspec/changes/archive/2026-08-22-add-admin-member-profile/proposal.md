## Why

審閱動線目前只有一半：**能從檢舉查到人，不能從人查到他做過什麼**。

`add-admin-moderation-ui` 在詳情頁塞了一段行為時間軸，那解決了「做這一筆判定時
他是初犯還是慣犯」。但審閱者接下來一定會問的三件事——他還在哪些房間、
他被檢舉過幾次、他現在是不是還在線上——目前**沒有任何地方看得到**。
停權一個人之前不知道他正在哪裡活動，是一個明顯的空白。

同時要處理一個上個 change 已經碰過一次的問題：成員的基本資料
（email、啟用狀態、加入時間）全部在 `GET /members/{id}` 後面，需要
`BACKEND:ACCOUNT:VIEW`——而審閱人員只有 `BACKEND:MODERATION:VIEW`。
權限拆開是刻意的（客服能審檢舉但不該碰帳號管理），所以答案同樣是
**在審閱側提供它自己需要的那份視圖**，而不是叫前端去打帳號管理的端點。

## What Changes

- **後端**：新增 `GET /api/admin/moderation/members/:memberId`，回傳審閱用的成員概覽——
  email、啟用狀態、加入時間、即時在線狀態、被檢舉次數、提出檢舉次數、所在聊天室清單。
  需 `BACKEND:MODERATION:VIEW`。
- **後端**：新增 `GET /api/admin/moderation/members/:memberId/reports`，
  回傳與該成員相關的檢舉（可依「被檢舉」或「提出的」過濾），分頁。
- **前端**：新增 `/moderation/members/:memberId` 成員概覽頁，
  五個區塊：基本資料、檢舉統計、聊天室清單、相關檢舉列表、行為時間軸。
- **前端**：檢舉詳情頁的「被檢舉人」與「檢舉人」變成可點的連結，導向該人的概覽頁。

**不做**：

- **訊息則數統計**。`chat_messages` 沒有 `senderId` 索引，算則數是全表掃描，
  要加 migration。而「他發了幾則」對判定的幫助遠小於「他被檢舉幾次」——
  等真的需要時再加索引，不要為了一個統計數字先付這個成本。
- **以 email 搜尋成員的入口**。「能列舉所有使用者」本身就是一種帳號資料存取，
  與權限拆分的初衷有張力。進入點只有檢舉——那也符合實際動線：
  審閱從來都是從檢舉開始的，不是逐人巡查。

## Capabilities

### New Capabilities

- `ui-member-profile`：後台成員概覽頁的前端行為——區塊組成、進入點、
  權限驅動的顯示、與檢舉詳情頁的往返。

### Modified Capabilities

- `api-moderation`：新增成員概覽與成員相關檢舉兩個查詢端點。

## Impact

- **後端**：`ModerationController` / `ModerationFacade` 各加兩支；
  新增 `GetMemberProfileService` 與 `ListMemberReportsService`；
  `ChatReportRepositoryPort` 加「依成員查檢舉」與「計數」；
  聊天室清單**沿用既有的** `ChatRoomRepositoryPort.listByMember()`（前台「我的房間」同一支）；
  在線狀態與基本資料沿用既有的 `PresencePort` 與 `LoadMemberPort`。
- **前端**：新增 `apps/web/src/routes/moderation/member-profile/`，
  `App.tsx` 加一條路由；檢舉詳情頁的當事人改成連結。
- **api-client**：`schema.ts` 需重新產生。
- **無 migration**：四個區塊用的都是既有索引
  （`idx_chat_reports_target_member`、`uq_chat_reports_reporter_message` 的前綴、
  `idx_chat_room_members_member`），在線狀態走 Redis。
- **無新環境變數**。
