> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由的塊加 `pnpm --filter @app/api test:e2e`；動到 WS 的塊加 `test:integration`；
> 動到 module 接線加 `pnpm build`；動到 swagger 加 `swagger:bundle` + api-client `generate`。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（schema）是所有後續的前提。
> 塊 2 **必須在塊 4 之前**——守則先到位，寫 handler 時才會被擋；順序反過來會先寫出違規的實作。
> 塊 3（REST）與塊 4（WS）互相獨立，但塊 4 的成員資格驗證需要塊 3 建立的 use case。
> 塊 5 是本 change 的驗收。

## 1. 資料模型

- [x] 1.1 `ChatRoomRecord`：`id` / `roomType`（`DIRECT` | `GROUP`）/ `name`（群組才有）/ `directKey` / 時間欄位。**所有 `DateTime` 標 `@db.Timestamptz(3)`**（專案慣例，UTC 由欄位層保證）
- [x] 1.2 `directKey` 加 **unique index**：值為兩個 memberId 排序後串接（`min:max`）。這是 1:1 唯一性的唯一保證來源——用「先查有沒有」會有競態，兩邊同時開啟對話就建出兩個房間
- [x] 1.3 `ChatRoomMemberRecord`：`(roomId, memberId)` 複合主鍵、`joinedAt`。**不做軟刪除**（見 design.md D5），離開即刪除該列
- [x] 1.4 索引：`(memberId)` 供「我的房間列表」、`(roomId)` 供成員查詢與授權判斷（每次 `joinRoom` 都會查）
- [x] 1.5 所有欄位加 `///` 描述，並用 `pnpm --filter @app/api gen:comments` 產生 `COMMENT ON` 附加到 migration。**`///` 不會產生 COMMENT ON**，兩層都要寫
- [x] 1.6 新增錯誤碼 `CHAT_ROOM_NOT_FOUND` / `CHAT_ROOM_SELF_DIRECT`（`response-codes.ts` + `response-messages.ts`）**以及使用它們的 domain exception**。
      **原本把 exception 排在塊 3 是切錯了**——`response-codes.spec.ts` 會擋下「已註冊但無人使用」的死碼，
      所以「錯誤碼 + 訊息 + exception」是鏈式依賴，必須同塊。實測被守則抓出來才發現
- [x] 1.7 驗證：`db:migrate` 產生 migration、`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 守則先行

- [x] 2.1 新增守則：接受資源識別碼的 `@SubscribeMessage` handler 必須呼叫 application 層。判定**必須先去除註解**——說明某個檢查的文字最常出現在有做該檢查的檔案裡
- [x] 2.2 豁免清單機制（比照 `allowlist.ts`），豁免項目必須註明理由
- [x] 2.3 **合成輸入的自我測試**：(a) handler 直接 `client.join(payload.roomId)` → 抓出；(b) 先呼叫 use case 再 join → 通過；(c) 只有註解提到授權 → 仍抓出；(d) payload 無資源識別碼 → 不檢查
- [x] 2.4 **此時 `joinGroup` 應該會被這條守則抓出來**——那正是它存在的理由。先確認它真的紅，再進塊 4 修它
- [x] 2.5 驗證：`pnpm --filter @app/api test:arch`，貼出護欄項數變化與 `joinGroup` 被抓出的訊息

## 3. 房間的 REST 端點

- [x] 3.1 用 `pnpm --filter @app/api gen:module chat-room --front` 產生骨架。**不要手刻**——產生器會一併注入錯誤碼、swagger 骨架並重跑 bundle 與 codegen
- [x] 3.2 `CreateDirectRoomService`：`directKey` 由 domain 層的單一函式產生（排序後串接），**單元測試釘住「A,B 與 B,A 產生相同 key」**
- [x] 3.3 撞 unique index（P2002）時回傳既有房間而非拋錯——Repository 層轉換，service 不感知 Prisma 錯誤碼
- [x] 3.4 `CreateGroupRoomService`：成員清單中有不存在或已停用者 → 整個請求失敗，**不可部分成功**
- [x] 3.5 `ListMyRoomsService` / `LeaveRoomService`：非成員離開回 `CHAT_ROOM_NOT_FOUND` 而非 `403`——回 403 等於洩漏房間存在
- [x] 3.6 e2e：四個端點的成功與失敗路徑，含「重複建立私聊回傳同一個房間」與「非成員看不到房間」
- [x] 3.7 驗證：`test:e2e` 全綠、`swagger:check` 無 drift

## 4. WS 事件改用房間語彙

- [x] 4.1 `events.ts`：`JOIN_GROUP` / `LEAVE_GROUP` → `JOIN_ROOM` / `LEAVE_ROOM`，新增 `ROOM_MEMBER_CHANGED`
- [x] 4.2 `GroupMembershipRequest.ts` → `RoomMembershipRequest.ts`，欄位 `groupId` → `roomId`
- [x] 4.3 `joinRoom` handler 改為呼叫 `JoinRoomUseCase` 取得許可後才 `client.join()`。**成員資格判斷在 application 層**，socket 操作留在 gateway
- [x] 4.4 `leaveRoom` 不需授權（對未加入的 socket room 執行離開是無害的無操作），但要在守則的豁免清單註明理由
- [x] 4.5 成員變動時經 `EventPublisherPort` 推送 `server:roomMemberChanged`——用 port 不用 Socket.IO，service 不該知道傳輸細節
- [x] 4.6 確認塊 2 的守則現在通過（`joinGroup` 的問題已修）
- [x] 4.7 **反向驗證**：把 `joinRoom` 的授權呼叫拿掉，確認 (a) 守則變紅；(b) 塊 5 的「非成員不能加入」測試變紅。兩者都要紅——只有守則紅代表測試沒涵蓋，只有測試紅代表守則沒抓到

## 5. 整合測試（本 change 的驗收）

- [x] 5.1 **修正 M1 的既有整合測試**：它們用任意 `groupId` 加入房間，補上驗證後會失敗。改為先建立房間與成員關係。**不可為了讓測試過而放寬驗證**
- [x] 5.2 ⭐ **非成員無法加入房間**：A 建立房間、C 不是成員，C 送 `joinRoom` → 收到 `CHAT_ROOM_NOT_FOUND`，且**後續該房間的廣播 C 收不到**（只驗錯誤碼不夠，要驗實際的隔離）
- [x] 5.3 跨實例的成員變動通知：A 連實例 1、B 連實例 2，同房間；B 離開 → A 收得到 `roomMemberChanged`
- [x] 5.4 1:1 唯一性在併發下成立：同時發兩個建立私聊的請求 → 只產生一個房間
- [x] 5.5 驗證：`test:integration` 全綠，貼出實際輸出

## 6. 文件與收尾

- [x] 6.1 `openspec/project.md`：「目的」的即時通訊層補上房間；技術棧無變動
- [x] 6.2 `README.md`：`ws:client` 的用法更新（`join <roomId>` 現在需要真實房間）
- [x] 6.3 跑完整驗證鏈並貼出實際輸出（含 e2e 與 integration）
- [x] 6.4 更新 `tasks/todo.md`；新踩到的坑寫進 `tasks/lessons.md`
- [x] 6.5 `openspec archive add-chat-rooms` 封存。**注意**：本 change 新增兩支能力，封存會建立兩份 master spec，記得補 Purpose 不要留 TBD
