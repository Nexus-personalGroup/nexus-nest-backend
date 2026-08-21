> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由的塊加 `pnpm --filter @app/api test:e2e`；動到 WS 的塊加 `test:integration`；
> 動到 swagger 加 `swagger:bundle` + api-client `generate`。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（schema + 稽核動作）是所有後續的前提。
> 塊 2（遮蔽與投影）**必須在塊 3 之前**：移除的訊息也要被遮蔽，而遮蔽只有一處。
> 塊 5 是驗收，其中「移除與撤回可區分」是本 change 的核心。
>
> **本 change 沒有新錯誤碼**——沿用 `CHAT_MESSAGE_NOT_FOUND`。
> 若中途發現需要，記得錯誤碼與 exception 必須同塊（已踩過兩次）。

## 1. 資料模型與稽核動作

- [x] 1.1 `ChatMessageRecord` 新增 `removedAt DateTime?`（`@db.Timestamptz(3)`）與 `removedBy String?`
- [x] 1.2 `removedBy` **不建外鍵**——稽核性質的欄位要能在帳號被刪除後仍然存在
- [x] 1.3 `///` 描述要寫清楚**為什麼不與 `retractedAt` 共用**（兩者對客戶端的語意不同）
- [x] 1.4 稽核動作 enum 加 `MESSAGE_REMOVED` / `MESSAGE_RESTORED`（`ChatAuditPort` 的聯集 + Prisma enum 兩處）
- [x] 1.5 `gen:comments` + **完整語句比對附加**，**migration 先 `--create-only`** 再 `deploy`（都已踩過）
- [x] 1.6 驗證：`db:migrate`、`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 遮蔽與投影（TDD）

- [x] 2.1 ⭐ `toMessage()` 的遮蔽條件從「已撤回」擴為「**已撤回或已移除**」。這是唯一的遮蔽點
- [x] 2.2 `ChatMessage` 型別加 `removedAt`
- [x] 2.3 ⭐ **單元測試逐條路徑釘住**：`findAfterSeq`（補齊）與 `findBeforeSeq`（歷史）
      對「只被移除」的訊息都要遮蔽——上一次反向驗證證明**兩條要分別測**
- [x] 2.4 兩個標記同時存在時仍遮蔽（撤回後再被移除）
- [x] 2.5 驗證：`pnpm test` 全綠

## 3. 移除與還原的寫入路徑（TDD）

- [x] 3.1 `ChatMessageRepositoryPort` 加 `remove` / `restore`；兩者都回傳「是否真的改變了狀態」
- [x] 3.2 ⭐ **冪等用單一 SQL 的條件達成**（`updateMany` + `removedAt: null` / `removedAt: not null`），
      不用讀-比-寫。與撤回、已讀位置同一個模式：狀態轉換的條件要寫在 SQL 裡
- [x] 3.3 `RemoveMessageService`：取訊息 → 標記 → 稽核 → 推播。**不檢查是否被檢舉過**（見 design.md D5）
- [x] 3.4 `RestoreMessageService`：清除標記 → 稽核 → 推播。**不碰 `retractedAt`**
- [x] 3.5 ⭐ 單元測試釘住：**沒有實際改變狀態時不推播、不寫稽核**（重複移除／還原未被移除的）
- [x] 3.6 ⭐ 單元測試釘住：**還原後 `retractedAt` 仍保留**——它回到「已收回」而非完全正常
- [x] 3.7 稽核呼叫必須 `catch`（守則會擋）
- [x] 3.8 驗證：`pnpm test` 全綠

## 4. 後台端點與推播

- [x] 4.1 `DELETE /api/admin/moderation/messages/:messageId` 與
      `POST /api/admin/moderation/messages/:messageId/restore`，掛在既有的 `ModerationController`
- [x] 4.2 兩者都掛 `@Permissions(BACKEND_MODERATION_EDIT)`
- [x] 4.3 `server-events.ts` 新增 `MESSAGE_REMOVED` / `MESSAGE_RESTORED`。
      **兩個獨立事件，不共用帶 `action` 的單一事件**（見 design.md D6）
- [x] 4.4 推播經 `EventPublisherPort`，**payload 不含 content**
- [x] 4.5 swagger yaml + `swagger:bundle` + api-client `generate`。
      **不要用 `allOf`**——會讓 api-client 產物編不過而 `swagger:check` 抓不到（已踩過）
- [x] 4.6 `_message.yaml` 加 `removedAt` 欄位
- [x] 4.7 驗證：`test:e2e` 全綠、`swagger:check` 無 drift、**`pnpm typecheck`**（swagger 動了就要跑）

## 5. 驗收

- [x] 5.1 ⭐ e2e：移除後歷史查詢看不到內容，但該則仍在、`seq` 保留、`removedAt` 有值
- [x] 5.2 ⭐ e2e：**`retractedAt` 仍是 null**——移除不是撤回，兩者必須分得開
- [x] 5.3 e2e：已被撤回的訊息仍可移除，兩個標記同時存在
- [x] 5.4 ⭐ e2e：**還原後 `retractedAt` 保留、`removedAt` 清除**
- [x] 5.5 e2e：重複移除 → `204` 且不覆寫時間；還原未被移除的 → `204` 且無變化
- [x] 5.6 e2e：只有 `VIEW` 權限 → `403`
- [x] 5.7 e2e：移除與還原各留一筆稽核
- [x] 5.8 整合：跨實例收得到 `messageRemoved`；payload 不含 content
- [x] 5.9 整合：補齊時被移除的訊息仍在、內容為空
- [x] 5.10 **反向驗證**：把 `toMessage()` 的移除遮蔽拿掉 → 5.1 與 5.9 **兩者都要紅**；
      把 `remove` 的條件改成無條件 update → 5.5 變紅
- [x] 5.11 驗證：`test:e2e` 與 `test:integration` 全綠（**先導到檔案再 grep**）

## 6. 文件與收尾

- [x] 6.1 `openspec/project.md`：補上管理員移除
- [x] 6.2 `smoke-test.md`：含「移除與撤回在前台顯示不同」的驗證步驟
- [x] 6.3 跑完整驗證鏈並貼出實際輸出
- [x] 6.4 更新 `tasks/todo.md`：移除訊息完成；**停用帳號**維持獨立待辦
- [x] 6.5 新踩到的坑寫進 `tasks/lessons.md`（**沒踩到就不要硬寫**）
- [x] 6.6 `openspec archive add-admin-message-removal`。新增一支能力，記得補 Purpose
- [x] 6.7 **提醒使用者**：訊息物件新增 `removedAt`，前台（獨立 repo）需同步調整
