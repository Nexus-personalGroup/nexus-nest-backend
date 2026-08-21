> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由的塊加 `pnpm --filter @app/api test:e2e`；動到 WS 的塊加 `test:integration`；
> 動到 swagger 加 `swagger:bundle` + api-client `generate`（**後台端點會進 api-client**）。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（稽核動作）是前提。
> 塊 2 **必須在塊 3 之前**：守則先到位。
> 塊 3（斷線機制）是本 change 的核心，塊 4 只是把入口接上。
> 塊 5 是驗收，其中「跨實例斷線」只有整合測試驗得出來。
>
> **本 change 沒有 migration**——沿用既有的 `members.status`（見 design.md D1）。
> **也沒有新錯誤碼**——沿用 `MEMBER_NOT_FOUND` 與既有的自我停用保護。

## 1. 稽核動作

- [x] 1.1 稽核動作 enum 加 `MEMBER_SUSPENDED` / `MEMBER_REINSTATED`（`ChatAuditPort` 的聯集 + Prisma enum 兩處）
- [x] 1.2 `ALTER TYPE ... ADD VALUE` **不可與「使用該值」放在同一個 migration**（PG 限制，已記過兩次）
- [x] 1.3 **migration 先 `--create-only`** 再 `deploy`（無欄位變更，只有 enum）
- [x] 1.4 驗證：`db:migrate`、`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 守則先行

- [x] 2.1 ⭐ 新增守則：**gateway 必須有處理 `sessionRevoked` 的訂閱**。
      這是「認證狀態變更必須能中止既有連線」的機器化——那個缺口的形狀是
      「每一層都正確、但沒有人負責銜接」，而那種缺口沒有守則就不會被發現
- [x] 2.2 判定：`ChatGateway` 必須訂閱撤銷事件（`@OnEvent` 或 gateway 內的 handler），
      **去註解後比對**
- [x] 2.3 **合成輸入的自我測試**：(a) gateway 沒有訂閱 → 抓出；(b) 有訂閱 → 通過；(c) 只有註解提到 → 仍抓出
- [x] 2.4 **確認此時是紅的**——訂閱還沒寫，這是預期中的紅（比照 `add-chat-rooms` 塊 2）
- [x] 2.5 驗證：`pnpm --filter @app/api test:arch`，貼出護欄項數變化

## 3. 斷線機制（本 change 的核心）

- [x] 3.1 `server-events.ts` 新增 `SESSION_REVOKED`
- [x] 3.2 `RevokeMemberSessionsUseCase` + service：推 `sessionRevoked` 到個人房間
- [x] 3.3 ⭐ **用既有的 `publishToMember`**，不新增基礎設施——它已經是跨實例的，
      而每條連線在 `handleConnection` 就加入了自己的個人房間
- [x] 3.4 `ChatGateway` 訂閱該事件：收到後把**本實例持有的**該成員連線斷開。
      各實例各自處理自己的，合起來就是跨實例
- [x] 3.5 ⭐ **先送事件再斷線**，順序不可顛倒——斷線後就沒有管道可以說明原因了。
      單元測試釘住這個順序
- [x] 3.6 `UpdateMemberService` 在 `status` 轉為 `false` 時呼叫它。
      **只在真的從啟用轉停用時**——已經是停用的不重複斷線
- [x] 3.7 停權／解除各寫一筆稽核，且 `catch`（守則會擋）
- [x] 3.8 驗證：`pnpm test` 全綠、塊 2 的守則轉綠

## 4. 後台入口

- [x] 4.1 `POST /api/admin/moderation/members/:memberId/suspend` 與 `.../reinstate`，
      掛在既有的 `ModerationController`，權限 `BACKEND:MODERATION:EDIT`
- [x] 4.2 ⭐ **兩個入口呼叫同一個 use case**（見 design.md D3）——
      各自實作會讓斷線與稽核的行為分歧，而分歧的那一邊不會有人發現
- [x] 4.3 冪等：已停用的再停權 → `204` 且不重複斷線／稽核
- [x] 4.4 停權自己 → 沿用既有保護（`UpdateMemberService` 已經擋了）
- [x] 4.5 swagger yaml + `swagger:bundle` + api-client `generate`。
      **不要用 `allOf`**（已踩過），swagger 動了就要跑 `pnpm typecheck`
- [x] 4.6 驗證：`test:e2e` 全綠、`swagger:check` 無 drift

## 5. 驗收

- [x] 5.1 ⭐ 整合：**被停權者在另一個實例上的連線被斷開**——這是本 change 的核心，
      只有跨實例測試驗得出來
- [x] 5.2 ⭐ 整合：**斷線前先收到 `sessionRevoked`**（順序，不只是「有斷線」）
- [x] 5.3 整合：同房間**其他成員的連線不受影響**
- [x] 5.4 ⭐ 整合：**停權後既有連線無法再送訊息**——這是漏洞本身的驗收
- [x] 5.5 e2e：從 moderation 入口停權 → `204` + 帳號停用 + 稽核
- [x] 5.6 e2e：只有 `VIEW` 權限 → `403`；停權自己 → `400`
- [x] 5.7 e2e：解除停權 → `204` + 帳號恢復 + 稽核；重複解除不重複稽核
- [x] 5.8 e2e：兩個入口（帳號管理 / moderation）的效果一致
- [x] 5.9 **反向驗證**：把 gateway 的斷線處理拿掉 → 5.1 與 5.4 **兩者都要紅**；
      把「先送事件」改成「先斷線」→ 5.2 變紅
- [x] 5.10 驗證：`test:e2e` 與 `test:integration` 全綠（**先導到檔案再 grep**）

## 6. 文件與收尾

- [x] 6.1 `openspec/project.md`：補上停權
- [x] 6.2 `openspec/project/backend-runtime.md`：**認證狀態變更與既有連線的關係**——
      這是最容易被下一個人忽略的銜接點
- [x] 6.3 `smoke-test.md`：含「停權後既有連線被踢掉」的驗證步驟
- [x] 6.4 跑完整驗證鏈並貼出實際輸出
- [x] 6.5 更新 `tasks/todo.md`：停權完成；處置動作整條線結束
- [x] 6.6 新踩到的坑寫進 `tasks/lessons.md`（**沒踩到就不要硬寫**）
- [x] 6.7 `openspec archive add-account-suspension`。新增兩支能力，記得補 Purpose
- [x] 6.8 **提醒使用者**：前台要處理 `server:sessionRevoked`，
      不要當成網路問題自動重連（否則會進入無盡的重連迴圈）
