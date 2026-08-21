> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由的塊加 `pnpm --filter @app/api test:e2e`；
> 動到 swagger 加 `swagger:bundle` + api-client `generate`（**後台端點會進 api-client**）。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（schema + 權限碼 + 錯誤碼）是所有後續的前提。錯誤碼與 exception 必須同塊（已踩過兩次）。
> 塊 2 **必須在塊 4 之前**：守則先到位，寫豁免時才會被檢查。
> 塊 3（讀取）與塊 5（狀態流轉）互相獨立。
> 塊 6 是驗收，其中「查看留稽核」與「列表不留稽核」是本 change 的核心。

## 1. 資料模型、權限碼與錯誤碼

- [x] 1.1 `ChatReportRecord` 新增 `reviewedAt DateTime?` / `reviewedBy String?` / `reviewNote String? @db.VarChar(500)`
- [x] 1.2 `reviewedBy` **不建外鍵**——稽核性質的欄位要能在帳號被刪除後仍然存在
- [x] 1.3 稽核動作 enum 加 `REPORT_VIEWED`（`ChatAuditPort` 的聯集 + Prisma enum 兩處）。**注意 `ALTER TYPE ... ADD VALUE` 不可與「使用該值」放在同一個 migration**（PG 限制，上個 change 的 PR 已記）
- [x] 1.4 `///` 描述 + `gen:comments`，**完整語句比對附加**，**migration 先 `--create-only`** 再 `deploy`
- [x] 1.5 權限碼 `BACKEND:MODERATION:VIEW` / `BACKEND:MODERATION:EDIT` 加進 `PermissionCode`
- [x] 1.6 seed 補這兩個權限碼；**確認既有 SUPERADMIN 角色會拿到**（不會自動——要看 seed 怎麼指派）
- [x] 1.7 新增錯誤碼 `CHAT_REPORT_NOT_FOUND` / `CHAT_REPORT_INVALID_TRANSITION` **以及 exception**（三檔同塊）
- [x] 1.8 驗證：`db:migrate`、`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 守則先行

- [x] 2.1 `chat-message-single-entry` 的豁免檢查加強：**與調查相關的豁免，理由必須同時涵蓋三個關鍵詞**（後台 / RBAC or 權限 / 稽核）
- [x] 2.2 **合成輸入的自我測試**：(a) 理由只寫「後台要用」→ 抓出；(b) 三者齊全 → 通過；(c) 空理由 → 抓出
- [x] 2.3 **此時豁免清單仍是空的**——確認規則不誤報，且「掃描範圍有效」不會因為空清單而假綠
- [x] 2.4 驗證：`pnpm --filter @app/api test:arch`，貼出護欄項數變化

## 3. 讀取路徑（TDD）

- [x] 3.1 `ChatReportRepositoryPort` 加 `list`（不含快照）、`findDetail`（含快照）、`updateStatus`
- [x] 3.2 ⭐ **`list` 的 select 不得包含 `contentSnapshot`**。單元測試釘住這件事——它是最容易「順手 select 全部」的地方
- [x] 3.3 `ChatAuditRepositoryPort` 加 `listByMember`（行為時間軸）
- [x] 3.4 `ListReportsService` / `GetReportDetailService` / `GetMemberTimelineService`
- [x] 3.5 ⭐ `GetReportDetailService` 寫 `REPORT_VIEWED` 稽核，**且 catch**（守則會擋）
- [x] 3.6 ⭐ `ListReportsService` **不寫稽核**。單元測試釘住——列表不含快照，記了會讓稽核量與「實際看到敏感內容」脫鉤
- [x] 3.7 驗證：`pnpm test` 全綠

## 4. 後台端點與豁免

- [x] 4.1 用 `pnpm --filter @app/api gen:module moderation --admin` 產生骨架，再依實際端點調整
- [x] 4.2 四支端點掛 `@Permissions`：三支讀走 `VIEW`、狀態流轉走 `EDIT`
- [x] 4.3 **這個 change 是否真的需要 `chat-message-single-entry` 的豁免？先確認**——檢舉詳情讀的是 `chat_reports.contentSnapshot`，**不是** `chat_messages`。若不需要，就不要加豁免（守則保持零豁免更好），並回頭修正 proposal 與 design 的說法
- [x] 4.4 若確實需要豁免，理由必須涵蓋三個條件（塊 2 的守則會檢查）
- [x] 4.5 swagger yaml + `swagger:bundle` + api-client `generate`
- [x] 4.6 驗證：`test:e2e` 全綠、`swagger:check` 無 drift

## 5. 狀態流轉

- [x] 5.1 `ReviewReportService`：`PENDING → REVIEWED / DISMISSED`；終態間可互轉
- [x] 5.2 目標狀態為 `PENDING` → `CHAT_REPORT_INVALID_TRANSITION`
- [x] 5.3 記錄 `reviewedAt` / `reviewedBy` / `reviewNote`
- [x] 5.4 單元測試釘住三種轉換（合法、終態互轉、回到 PENDING）
- [x] 5.5 驗證：`pnpm test` 全綠

## 6. 驗收

- [x] 6.1 ⭐ e2e：**查看詳情 → 有一筆 `REPORT_VIEWED` 稽核**
- [x] 6.2 ⭐ e2e：**瀏覽列表 → 沒有任何稽核**
- [x] 6.3 ⭐ e2e：列表回應**不含** `contentSnapshot`；詳情回應**含**
- [x] 6.4 e2e：只有 `VIEW` 權限的帳號做狀態流轉 → `403`
- [x] 6.5 e2e：沒有 moderation 權限的帳號查佇列 → `403`
- [x] 6.6 e2e：被檢舉的訊息已撤回時，詳情仍回傳快照內容
- [x] 6.7 e2e：行為時間軸只回該成員的紀錄
- [x] 6.8 **反向驗證**（結果與預期不同，見 design.md）：把詳情的稽核呼叫拿掉 → 6.1 確實變紅。
      但把 `list` 的 select 加上 `contentSnapshot` → **6.3 沒有變紅**，因為投影函式不會複製它；
      再往前把它加進投影函式 → **TypeScript 直接編譯失敗**。
      真正的防線是**型別**（列表視圖與詳情視圖是兩個型別），select 只是順手的最佳化。
- [x] 6.9 驗證：`test:e2e` 全綠（**先導到檔案再 grep**）

## 7. 文件與收尾

- [x] 7.1 `openspec/project.md`：補上後台審閱
- [x] 7.2 `openspec/project/backend-runtime.md`：新增的兩個權限碼進 RBAC 說明
- [x] 7.3 `smoke-test.md`：含「查看留稽核、瀏覽不留稽核」的驗證步驟
- [x] 7.4 跑完整驗證鏈並貼出實際輸出
- [x] 7.5 更新 `tasks/todo.md`：後台查詢完成；**把「保留期限」升級成獨立待辦**（已在三個 change 的 Open Questions 出現過）
- [x] 7.6 新踩到的坑寫進 `tasks/lessons.md`
- [x] 7.7 `openspec archive add-admin-moderation`。新增一支能力，記得補 Purpose
