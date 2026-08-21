> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由的塊加 `pnpm --filter @app/api test:e2e`；動到 swagger 加 `swagger:bundle`。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（schema + 錯誤碼 + exception）是所有後續的前提。錯誤碼與 exception 必須同塊（已踩過兩次）。
> 塊 2 是本 change 的核心（授權與冪等），塊 3 只是把它接到 REST 上。
> 塊 4 是驗收。
>
> **本 change 沒有 WS 事件**——被檢舉者不知情，因此沒有任何推播。
> 若中途想加「檢舉已受理」的推播給檢舉人，先回頭看 design.md D4。

## 1. 資料模型與錯誤碼

- [x] 1.1 `ChatReportRecord`：`id` / `reporterId` / `targetMessageId` / `targetMemberId` / `roomId` / `reason`（DB enum）/ `description?` / `contentSnapshot` / `status`（DB enum）/ `createdAt`
- [x] 1.2 `(reporterId, targetMessageId)` **unique index**——冪等的唯一保證來源
- [x] 1.3 `status` 現在恆為 `PENDING`。**刻意留著**：後台佇列的第一個查詢就是「給我所有 PENDING 的」，沒有它下一個 change 要先做資料遷移（見 design.md）
- [x] 1.4 **不加 `reviewedAt` / `reviewedBy`**——語意取決於「處置」長什麼樣，而那還沒設計
- [x] 1.5 `contentSnapshot` 的 `///` 描述要寫清楚**為什麼這裡違反「稽核不複製內容」**（訊息可能在審閱前被撤回或清理），以及它**只給後台**
- [x] 1.6 索引：`(status, createdAt)` 供後台佇列；`(targetMemberId)` 供「這個人被檢舉幾次」
- [x] 1.7 `gen:comments` 產生 `COMMENT ON`，**用完整語句比對附加**，**migration 先 `--create-only`** 再 `migrate deploy`（兩個都已踩過）
- [x] 1.8 新增錯誤碼 `CHAT_REPORT_SELF` **以及使用它的 domain exception**（三檔同塊）
- [x] 1.9 稽核動作 enum 加 `REPORT_SUBMITTED`（`ChatAuditPort` 的聯集 + Prisma enum 兩處）
- [x] 1.10 驗證：`db:migrate`、`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 檢舉的寫入路徑（TDD，本 change 的核心）

- [x] 2.1 `ChatReportRepositoryPort`：`findOrCreate`（撞唯一索引回傳既有那筆）
- [x] 2.2 P2002 由 **repository** 轉換成「回傳既有」，service 不感知 Prisma 錯誤碼
- [x] 2.3 `SubmitReportService`：取訊息 → 成員資格（`ENSURE_ROOM_MEMBERSHIP_USE_CASE`，已存在）→ 不可檢舉自己 → 快照內容 → 建立 → 稽核
- [x] 2.4 ⭐ **非成員與訊息不存在回同一個錯誤**（`CHAT_MESSAGE_NOT_FOUND`）。單元測試釘住兩者的 `code` 相同
- [x] 2.5 ⭐ **快照取自資料庫的原始內容，不是遮蔽後的**——被撤回的訊息也要能檢舉。**這需要繞過 `toMessage()` 的遮蔽**，因此 repository 要有一條明確的取值路徑（不是新增一個泛用的「取原始內容」方法，那會變成洩漏管道）
- [x] 2.6 檢舉自己的訊息 → `CHAT_REPORT_SELF`，且不建立任何紀錄
- [x] 2.7 稽核呼叫必須 `catch`（守則會擋）
- [x] 2.8 驗證：`pnpm test` 全綠

## 3. REST 端點

- [x] 3.1 `POST /api/front/chat-reports`，新開 `ChatReportController`（記得標 `@MemberScoped()`）
- [x] 3.2 回應**不含被檢舉者資訊**——檢舉人已經知道那是誰，回傳它只會多一條確認身分的路徑
- [x] 3.3 Zod schema：`reason` 是聯集、`description` 上限 500
- [x] 3.4 swagger yaml + `swagger:bundle`
- [x] 3.5 驗證：`test:e2e` 全綠、`swagger:check` 無 drift

## 4. 驗收

- [x] 4.1 e2e：成功檢舉 → `200` + `PENDING`，且 `contentSnapshot` 等於原訊息內容
- [x] 4.2 ⭐ e2e：**重複檢舉回同一個 `reportId`**，DB 只有一筆
- [x] 4.3 e2e：不同人檢舉同一則 → 兩筆
- [x] 4.4 e2e：非成員檢舉 → `404`，與「訊息不存在」同一個錯誤碼
- [x] 4.5 e2e：檢舉自己 → `400` `CHAT_REPORT_SELF`
- [x] 4.6 ⭐ e2e：**檢舉已撤回的訊息 → 照常受理，且快照是原內容不是空字串**
- [x] 4.7 e2e：檢舉後有 `REPORT_SUBMITTED` 稽核紀錄
- [x] 4.8 **反向驗證**：把成員資格檢查拿掉 → 4.4 變紅；把 `findOrCreate` 改成純 `create` → 4.2 變紅
- [x] 4.9 驗證：`test:e2e` 全綠（**先導到檔案再 grep**，見 todo.md 的間歇性失敗筆記）

## 5. 文件與收尾

- [x] 5.1 `openspec/project.md`：補上檢舉
- [x] 5.2 `smoke-test.md`：檢舉的 curl，含「重複檢舉」與「檢舉已撤回訊息」兩個關鍵情境
- [x] 5.3 跑完整驗證鏈並貼出實際輸出
- [x] 5.4 更新 `tasks/todo.md`：檢舉入口完成，`add-admin-moderation` 移入進行中
- [x] 5.5 新踩到的坑寫進 `tasks/lessons.md`
- [x] 5.6 `openspec archive add-chat-report`。新增一支能力，記得補 Purpose
