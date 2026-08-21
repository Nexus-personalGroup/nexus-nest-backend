> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由加 `pnpm --filter @app/api test:e2e`；動到 module 接線加 `pnpm build`；
> 動到 swagger yaml 加 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`。
> **驗證一律看 exit code**，且反向驗證要**兩邊都看**：破壞後紅、還原後綠。
> 跑單一測試檔用 `cd apps/api && pnpm jest <path>`，**不要用 `--filter`**——
> 那會因為「沒有 jest script」回 exit 1，看起來跟測試失敗一模一樣（已踩過）。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（概覽端點）與塊 2（相關檢舉端點）互相獨立，但兩者都動 swagger，
> **綁在同一次重生成**（塊 3）。塊 4 是後端驗收。
> 塊 5～6 是前端，依賴塊 3 產出的型別。
>
> **本 change 沒有 migration**——四個區塊用的都是既有索引。
> 若實作中發現需要加索引，那代表選錯了資料來源，回頭看 design.md 的最後一節。

## 1. 後端：成員概覽端點

- [x] 1.1 ⭐ 回應**只有七個欄位**：`email` / `status` / `joinedAt` / `isOnline` /
      `reportedCount` / `submittedReportCount` / `roomCount`。
      **不回角色、權限、最後登入 IP**——那些屬於 `BACKEND:ACCOUNT:VIEW` 的範圍。
      最容易犯的錯是「反正 `loadMemberById` 都查回來了，順手全回」
- [x] 1.2 ⭐ 兩個計數用 `count` 查詢，**不要取回清單再算長度**。
      `ChatReportRepositoryPort` 加 `countByMember(memberId, role)`
- [x] 1.3 房間數與在線狀態沿用既有的 `ChatRoomRepositoryPort.listByMember()`
      與 `PresencePort.isOnline()`，**不要新寫查詢**。
      **實作時補做**：ui spec 要的是聊天室**清單**而 api spec 只定義了 `roomCount`，
      兩份 spec 對不上（admin api-client 沒有房間列表，`/chat/rooms` 是前台的）。
      補了第三支端點 `GET /moderation/members/:memberId/rooms`，同樣複用 `listByMember`
- [x] 1.4 成員不存在或已軟刪除 → `MEMBER_NOT_FOUND`（既有錯誤碼，不需新增）
- [x] 1.5 ⭐ 本端點**不寫稽核**——回應不含任何訊息內容。
      比照 `ListReportsService`：不注入稽核 port，讓它在型別層面就不可能寫
- [x] 1.6 單元測試：七個欄位齊全、計數為 0 的成員、成員不存在拋例外、
      **計數是用 count 而非 list**（斷言 mock 的 `countByMember` 被呼叫、`list` 沒有）
- [x] 1.7 驗證：`cd apps/api && pnpm test` 全綠

## 2. 後端：成員相關檢舉端點

- [x] 2.1 `role` query 用 `z.enum(['TARGET', 'REPORTER'])`，預設 `TARGET`。
      **兩個方向分開查**，不要合併回傳——「他被檢舉」與「他檢舉別人」是兩件事
- [x] 2.2 ⭐ 每一列回**對造**的 email（`TARGET` 時是檢舉人、`REPORTER` 時是被檢舉人），
      沿用上個 change 的批次補值做法：service 層一次查完，不逐列查
- [x] 2.3 ⭐ 回應 **MUST NOT 含 `contentSnapshot`**。repository 的投影函式是真正的防線
      （上個 change 反向驗證確認過：`listSelect` 多選一個欄位不會外洩，投影擋在後面）
- [x] 2.4 單元測試：兩個方向各自只回對應的檢舉、對造 email 正確、
      對造帳號已刪除 → `null`、**補 email 只查一次**
- [x] 2.5 驗證：`cd apps/api && pnpm test` 全綠

## 3. Swagger 與 api-client

- [x] 3.1 兩支端點的 yaml，註冊進 `openapi.yaml`。
      **不要用 `allOf`**——openapi-typescript 會產出交集型別，api-client codegen 取
      `.schema` 會失敗，而 `swagger:check` 抓不到，只有 `pnpm typecheck` 會紅（已踩過）
- [x] 3.2 `counterpartEmail` 標 `nullable: true` 並寫清楚 `null` 的來源
- [x] 3.3 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`，
      `schema.ts` 的 diff 進 commit
- [x] 3.4 驗證：`swagger:check` exit 0、`pnpm typecheck` 全綠

## 4. 後端 e2e 驗收

- [x] 4.1 ⭐ e2e：概覽回應的欄位鍵**完全等於**那七個 + `memberId`——
      用 `Object.keys().sort()` 斷言，不要用 `objectContaining`。
      後者抓不到「多回了角色」，而那正是這裡最該擋的事
- [x] 4.2 e2e：概覽不寫任何稽核（查完 `chat_audit_logs` 是空的）
- [x] 4.3 e2e：`role=TARGET` 與 `role=REPORTER` 各自只回對應方向的檢舉
- [x] 4.4 e2e：對造帳號軟刪除後 → `counterpartEmail` 為 `null` 且該筆仍在列表中
- [x] 4.5 e2e：只有 `BACKEND:ACCOUNT:VIEW`（沒有 MODERATION）→ 兩支都 403
- [x] 4.6 **反向驗證**：概覽多回一個 `roleName` → 4.1 要紅；
      在 service 注入並呼叫稽核 port → 4.2 要紅；
      把 `role` 的過濾拿掉 → 4.3 要紅。三者還原後都要綠
- [x] 4.7 驗證：`pnpm --filter @app/api test:e2e` exit 0

## 5. 前端：概覽頁

- [x] 5.1 `apps/web/src/routes/moderation/member-profile/page.tsx`，
      路由 `/moderation/members/:memberId`。**Sidebar 不加項目**——
      沒有列表可以進入，一個點進去只看到「請提供 ID」的選單項目比沒有更糟
- [x] 5.2 五個區塊：基本資料、檢舉統計、聊天室清單、相關檢舉、行為時間軸。
      時間軸**直接複用** `MemberTimeline`，不要另寫
- [x] 5.3 ⭐ 在線狀態要標明是「查詢當下」，不輪詢。
      不標的話使用者會以為它即時，然後在它不變時懷疑系統壞了
- [x] 5.4 停權的成員要**明顯**標示，不只是一個「停用」文字
- [x] 5.5 ⭐ 返回**不得寫死回佇列**：使用者可能是從某筆檢舉詳情過來的，
      跳回佇列會弄丟他的位置。用瀏覽器歷史返回
- [x] 5.6 `404` → 「成員不存在」與返回方式，不要空白畫面
- [x] 5.7 單元測試：純函式（在線狀態文案、房間名稱的私聊 fallback、對造 email fallback）
- [x] 5.8 驗證：`cd apps/web && pnpm test` 全綠（**不要寫成 `pnpm test run`**，
      那會變成 `vitest run run` 而找不到測試檔，exit 1 但原因與測試無關）

## 6. 前端：相關檢舉與往返連結

- [x] 6.1 方向切換（被檢舉／提出的），預設「被檢舉」，同步到 URL query
- [x] 6.2 每一列顯示**對造**的 email，不要重複顯示這個人自己
- [x] 6.3 點任一列 → 導向該筆檢舉詳情
- [x] 6.4 ⭐ 檢舉詳情頁的「檢舉人」「被檢舉人」改成連往概覽頁的連結
- [x] 6.5 ⭐ **不得 prefetch 檢舉詳情**（含 hover 預載）——點進去才寫稽核
- [x] 6.6 元件測試：方向切換顯示對造、空清單的空狀態
- [x] 6.7 **反向驗證**：把 6.2 改成顯示自己 → 對應測試紅；還原後綠
- [x] 6.8 驗證：`pnpm typecheck && pnpm lint && pnpm test:cov` 全綠

## 7. 收尾

- [x] 7.1 跑完整驗證鏈並貼出實際輸出（**exit code**），含 `test:e2e` 與 `build`
- [x] 7.2 `smoke-test.md`：從檢舉詳情點進當事人、切換檢舉方向、返回。
      **含一項只有人工驗得到的**：在相關檢舉列表 hover 不會發出詳情請求（看 Network）
- [x] 7.3 `openspec/project.md`：補上成員概覽頁
- [x] 7.4 更新 `tasks/todo.md`：M4 再拆掉一項，剩 SSE 儀表板與聊天室總覽
- [x] 7.5 新踩到的坑寫進 `tasks/lessons.md`（**沒踩到就不要硬寫**）
- [x] 7.6 `openspec archive add-admin-member-profile`
