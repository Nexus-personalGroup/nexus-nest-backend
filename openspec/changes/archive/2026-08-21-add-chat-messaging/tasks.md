> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由的塊加 `pnpm --filter @app/api test:e2e`；動到 WS 的塊加 `test:integration`；
> 動到 module 接線加 `pnpm build`；動到 swagger 加 `swagger:bundle` + api-client `generate`。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（schema + 錯誤碼 + exception）是所有後續的前提。**錯誤碼與它的 exception 必須同塊**
> ——`response-codes.spec.ts` 會擋下「已註冊但無人使用」的死碼（`add-chat-rooms` 實測踩過）。
> 塊 2 **必須在塊 4 之前**：守則先到位，寫 handler 時才會被擋。
> 塊 3（寫入路徑）是本 change 的核心，塊 4 只是把它接到 WS 上。
> 塊 6 是驗收。

## 1. 資料模型與錯誤碼

- [x] 1.1 `ChatMessageRecord`：`id` / `roomId` / `senderId` / `content` / `seq` / `clientMessageId` / 時間欄位。**所有 `DateTime` 標 `@db.Timestamptz(3)`**
- [x] 1.2 `(roomId, clientMessageId)` **unique index**——去重的唯一保證來源。`(roomId, seq)` 也要 unique：`seq` 在房間內必須唯一，讓計數器的錯誤在寫入當下就爆而不是靜默產生重號
- [x] 1.3 `(roomId, seq)` 的查詢索引供補齊與歷史查詢（兩者都是「某房間、seq 大於／小於 N」）
- [x] 1.4 `ChatRoomRecord` 新增 `lastSeq Int @default(0)`——既有列以預設值回填
- [x] 1.5 `ChatRoomReadRecord`：複合主鍵 `(roomId, memberId)`、`lastReadSeq`。**不存未讀數**（見 design.md D5）
- [x] 1.6 所有欄位加 `///` 描述，`pnpm --filter @app/api gen:comments` 產生 `COMMENT ON` 附加到 migration。**`///` 不會產生 COMMENT ON**，兩層都要寫
- [x] 1.7 新增錯誤碼 `CHAT_MESSAGE_RATE_LIMITED` **以及使用它的 domain exception**（`response-codes.ts` + `response-messages.ts` + `domain/exception/`）。三者是鏈式依賴，缺一個就紅
- [x] 1.8 新增環境變數 `WS_MESSAGE_RATE_LIMIT` / `WS_MESSAGE_RATE_WINDOW_SEC` 到 `validate-env.ts` 的 `envSchema`，並更新 `.env.example`（無點的 `env.example` 給使用者複製）
- [x] 1.9 驗證：`db:migrate`、`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 守則先行

- [x] 2.1 新增守則：呼叫寫入型 use case 的 `@SubscribeMessage` handler 必須經過限流。判定**必須先去除註解**——`add-chat-rooms` 踩過：註解裡提到的裝飾器會把定位起點拉進註解內部，讓 `stripComments` 失效
- [x] 2.2 守則同時檢查「限流閾值不得是字面值」——閾值必須來自 `getEnv()`
- [x] 2.3 **合成輸入的自我測試**：(a) handler 呼叫寫入 use case 但無限流 → 抓出；(b) 有限流 → 通過；(c) 只有註解提到限流 → 仍抓出；(d) 唯讀 handler → 不檢查；(e) 閾值寫死 → 抓出
- [x] 2.4 豁免清單機制（比照 `WS_RESOURCE_ACCESS_EXEMPTIONS`），含「過期豁免」與「必須註明理由」兩項檢查
- [x] 2.5 驗證：`pnpm --filter @app/api test:arch`，貼出護欄項數變化

## 3. 訊息的寫入路徑（本 change 的核心，TDD）

- [x] 3.1 `ChatMessageRepositoryPort`：`append`（配號 + 寫入，單一交易）、`findAfterSeq`、`findBeforeSeq`
- [x] 3.2 `append` 在**同一個交易**內 `UPDATE chat_rooms SET last_seq = last_seq + 1 RETURNING last_seq` 再寫訊息。**單元測試釘住「配號與寫入不可分離」**——分成兩個交易時，中間失敗會讓號碼被吃掉而形成洞
- [x] 3.3 撞 `(roomId, clientMessageId)` 唯一索引（P2002）時回傳既有訊息而非拋錯。**Repository 層轉換**，service 不感知 Prisma 錯誤碼
- [x] 3.4 `SendMessageService`：成員資格用 `ENSURE_ROOM_MEMBERSHIP_USE_CASE`（**已存在，不要另寫一份**）→ 限流 → append → 廣播
- [x] 3.5 **單元測試釘住 ack 的時序**：寫入失敗時 MUST NOT 廣播、MUST NOT 回 ack。這是 D1 的核心，也是新守則的 scenario
- [x] 3.6 `MessageRateLimitPort` + Redis 實作：每人每房間的滑動視窗計數。閾值來自 `getEnv()`
- [x] 3.7 `SyncRoomService`：回傳 `seq > lastSeq` 的訊息，**上限筆數 + `hasMore` 旗標**。單元測試釘住「剛好等於上限時 `hasMore` 必須為 true」——差一錯誤在這裡的症狀是靜默丟訊息
- [x] 3.8 驗證：`pnpm test` 全綠

## 4. WS 事件

- [x] 4.1 `events.ts` 新增 `SEND_MESSAGE` / `SYNC_ROOM`；`server-events.ts` 新增 `MESSAGE_ACK` / `MESSAGE_CREATED` / `ROOM_SYNCED` / `ROOM_READ`
- [x] 4.2 `SendMessageRequest` / `SyncRoomRequest`：Zod schema，`content` 限長（上限進環境變數還是常數？先用常數，超出範圍再說）
- [x] 4.3 `handleSendMessage`：呼叫 use case → **等它完成** → 回 ack。廣播由 service 經 `EventPublisherPort` 送出，gateway 不碰 Socket.IO 的房間 API
- [x] 4.4 `handleSyncRoom`：同樣先驗成員資格
- [x] 4.5 確認塊 2 的守則通過
- [x] 4.6 **反向驗證**：把限流呼叫拿掉，確認 (a) 守則變紅；(b) 塊 6 的限流測試變紅。兩者都要紅

## 5. 歷史查詢與已讀（REST）

- [x] 5.1 用 `gen:module` 或沿用 `FrontChatRoomModule`？**先確認**：訊息端點掛在 `/chat-rooms/:roomId/messages` 之下，路由屬於既有 controller 還是新開一支——新開一支比較清楚，但要確認 `side-isolation` 與 `authorization-coverage` 都過（新 controller 記得標 `@MemberScoped()`）
- [x] 5.2 `GET /chat-rooms/:roomId/messages`：游標分頁（`beforeSeq`），非成員回 `404`
- [x] 5.3 `PATCH /chat-rooms/:roomId/read`：已讀單調前進，倒退視為無操作（回 204 但不推播）
- [x] 5.4 `lastReadSeq` 大於房間 `lastSeq` 時以房間值為準
- [x] 5.5 swagger yaml + `swagger:bundle`；前台文件的 `security` 已是全域 Bearer，新端點不需另標
- [x] 5.6 e2e：兩支端點的成功與失敗路徑，含「往回翻頁不重疊」與「非成員看不到訊息」
- [x] 5.7 驗證：`test:e2e` 全綠、`swagger:check` 無 drift

## 6. 整合測試（本 change 的驗收）

- [x] 6.1 ⭐ **跨實例送收**：A 連實例 1 送訊息，B 連實例 2 收得到 `messageCreated`，且 `seq` 一致
- [x] 6.2 ⭐ **重送不產生第二則**：同一個 `clientMessageId` 送兩次 → 兩次 ack 的 `messageId` 與 `seq` 相同，DB 只有一列
- [x] 6.3 ⭐ **併發送出的 seq 不重號**：兩個實例同時各送 N 則 → `seq` 集合恰好是 1..2N，無重複無空洞。**這是 D2 的驗收**，單機測試驗不出來
- [x] 6.4 **斷線補齊**：連線 → 收到 seq 10 → 斷線 → 期間有新訊息 → 重連送 `syncRoom { lastSeq: 10 }` → 補齊且無重複
- [x] 6.5 補齊超過上限時 `hasMore: true`
- [x] 6.6 限流：超過閾值後回 `CHAT_MESSAGE_RATE_LIMITED`，且**該訊息沒有落庫**
- [x] 6.7 已讀通知跨實例送達
- [x] 6.8 驗證：`test:integration` 全綠，貼出實際輸出

## 7. 文件與收尾

- [x] 7.1 `openspec/project.md`：即時通訊層補上訊息與已讀
- [x] 7.2 `README.md`：`ws:client` 支援送訊息與補齊的用法
- [x] 7.3 `smoke-test.md`：手動驗證兩支 REST 端點的 curl
- [x] 7.4 跑完整驗證鏈並貼出實際輸出（含 e2e 與 integration）
- [x] 7.5 更新 `tasks/todo.md`：**撤回／刪除訊息**與**附件訊息**寫成明確待辦（使用者已確認要做，不是「可能」），並註明 design.md 已檢查過現有 schema 不擋路
- [x] 7.6 新踩到的坑寫進 `tasks/lessons.md`
- [x] 7.7 `openspec archive add-chat-messaging`。**注意**：新增兩支能力，記得補 Purpose 不要留 TBD
