> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由的塊加 `pnpm --filter @app/api test:e2e`；動到 WS 的塊加 `test:integration`；
> 動到 module 接線加 `pnpm build`；動到 swagger 加 `swagger:bundle` + api-client `generate`。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（schema + 錯誤碼 + exception + env）是所有後續的前提。
> **錯誤碼與它的 exception 必須同塊**——`response-codes.spec.ts` 會擋下死碼（已踩過兩次）。
> 塊 2 **必須在塊 3 之前**：守則先到位，寫實作時才會被擋。
> 塊 4 是本 change 的驗收，其中「三條讀取路徑」是最容易漏的部分。

## 1. 資料模型與錯誤碼

- [x] 1.1 `ChatMessageRecord` 新增 `retractedAt DateTime?` 與 `retractedBy String?`，皆 `@db.Timestamptz(3)`（時間欄位）
- [x] 1.2 `///` 描述要寫清楚「內容保留、只對外遮蔽」以及「該列不可刪除，刪了 seq 會有洞」，並用 `gen:comments` 產生 `COMMENT ON`。**用完整語句比對附加到 migration**，不要用跨行 regex（會吃掉前一條語句的結尾，已踩過）
- [x] 1.3 新增錯誤碼 `CHAT_MESSAGE_NOT_FOUND` / `CHAT_MESSAGE_RETRACT_EXPIRED` **以及使用它們的 domain exception**（`response-codes.ts` + `response-messages.ts` + `domain/exception/`）。三者是鏈式依賴
- [x] 1.4 `CHAT_MESSAGE_NOT_FOUND` 的訊息要涵蓋「不存在」與「不是你的」兩種情形，**不得分開**——分開等於提供探測工具
- [x] 1.5 新增環境變數 `CHAT_RETRACT_WINDOW_SEC`（預設 300）到 `envSchema`；`.env.example` 的兩行給使用者貼
- [x] 1.6 驗證：`db:migrate`、`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 守則先行

- [x] 2.1 新增守則：`prisma.chatMessageRecord` 只能出現在訊息的 repository。判定**必須先去除註解**
- [x] 2.2 豁免清單機制（比照既有兩份），含「過期豁免」與「必須註明理由」兩項檢查
- [x] 2.3 **合成輸入的自我測試**：(a) service 直接查訊息表 → 抓出；(b) repository 自己 → 通過；(c) 只有註解提到 → 不抓；(d) 豁免無理由 → 抓出
- [x] 2.4 **確認測試與 seed 不會被誤判**：`test/` 與 `seeds/` 為了準備資料會直接寫入訊息表，判定範圍要排除它們（或列入豁免）。**先跑一次確認現況是綠的**，再進塊 3
- [x] 2.5 驗證：`pnpm --filter @app/api test:arch`，貼出護欄項數變化

## 3. 撤回的寫入路徑（TDD）

- [x] 3.1 `ChatMessageRepositoryPort` 新增 `findByIdInRoom`（含 senderId 與 createdAt，供授權與時限判斷）與 `retract`
- [x] 3.2 `toMessage()` 加上遮蔽：`retractedAt` 有值時 `content` 回空字串。**這是唯一的遮蔽點**，不要在 service 各自處理
- [x] 3.3 `RetractMessageService`：成員資格用 `ENSURE_ROOM_MEMBERSHIP_USE_CASE`（已存在）→ 取訊息 → 非本人或不存在皆回 `CHAT_MESSAGE_NOT_FOUND` → 超時回 `CHAT_MESSAGE_RETRACT_EXPIRED` → 標記 → 推播
- [x] 3.4 **冪等**：已撤回時直接回成功且**不重複推播**。單元測試釘住「不重播」
- [x] 3.5 時限以伺服器的 `createdAt` 為準。單元測試用**注入的時鐘或固定時間**，不要用 `Date.now()` 讓測試依賴真實時間
- [x] 3.6 單元測試釘住：撤回失敗（逾時／非本人）時 **MUST NOT 推播**——沒有東西改變
- [x] 3.7 驗證：`pnpm test` 全綠

## 4. 三條讀取路徑的遮蔽（本 change 的驗收）

> 漏掉任何一條就是內容洩漏，而且不會有徵兆。**每條都要有自己的測試**，
> 不能只驗一條就當作涵蓋。

- [x] 4.1 ⭐ 歷史查詢（REST）：撤回後的訊息仍在結果中、`seq` 連續、`content` 為空字串、`retractedAt` 有值
- [x] 4.2 ⭐ 斷線補齊（WS `syncRoom`）：同上，且**不可把該則濾掉**
- [x] 4.3 ⭐ 即時廣播：`messageCreated` 的 payload 不含已撤回的內容。目前不可能發生（新訊息不會已被撤回），仍要測——「現在不可能」與「以後也不可能」是兩件事
- [x] 4.4 **反向驗證**：把 `toMessage()` 的遮蔽拿掉，確認 4.1 與 4.2 **兩者都紅**。只有一條紅代表另一條沒被涵蓋

## 5. REST 端點與推播

- [x] 5.1 `DELETE /chat-rooms/:roomId/messages/:messageId` 掛在既有的 `ChatMessageController`（已標 `@MemberScoped()`）
- [x] 5.2 `server-events.ts` 新增 `MESSAGE_RETRACTED`；推播經 `EventPublisherPort`，**payload 不含 content**
- [x] 5.3 swagger yaml + `swagger:bundle`；`_message.yaml` 加 `retractedAt` 欄位
- [x] 5.4 e2e：成功、非本人（404）、逾時（403）、重複撤回（204 且不重播）、非成員（404）
- [x] 5.5 驗證：`test:e2e` 全綠、`swagger:check` 無 drift

## 6. 整合測試

- [x] 6.1 跨實例推播：A 連實例 1 撤回，B 連實例 2 收得到 `messageRetracted`
- [x] 6.2 推播 payload **不含 content**
- [x] 6.3 撤回後補齊：斷線期間有訊息被撤回，重連補齊時該則仍在、`seq` 連續、內容為空
- [x] 6.4 驗證：`test:integration` 全綠，貼出實際輸出

## 7. 文件與收尾

- [x] 7.1 `openspec/project.md`：即時通訊層補上撤回
- [x] 7.2 `README.md`：`ws:client` 加 `retract` 指令（或說明用 curl 撤回）
- [x] 7.3 `smoke-test.md`：撤回的手動驗證，**含「三條讀取路徑都看不到內容」的檢查步驟**
- [x] 7.4 跑完整驗證鏈並貼出實際輸出（含 e2e 與 integration）
- [x] 7.5 更新 `tasks/todo.md`：撤回移到已完成；**附件訊息**維持明確待辦
- [x] 7.6 新踩到的坑寫進 `tasks/lessons.md`
- [x] 7.7 `openspec archive add-message-retraction`。**注意**：新增一支能力（`ws-chat-retraction`），記得補 Purpose 不要留 TBD
- [x] 7.8 **提醒使用者**：訊息物件新增 `retractedAt` 且撤回時 `content` 為空字串，前台（獨立 repo）需同步調整
