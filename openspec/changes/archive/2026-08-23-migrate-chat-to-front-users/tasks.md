> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由加 `pnpm --filter @app/api test:e2e`；動到 WS / presence 加
> `pnpm --filter @app/api test:integration`（真實 Redis，**不可 mock**）；
> 動到 module 接線加 `pnpm build`。
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
> 時間相關的測試用 `TZ=UTC` 再跑一次（已踩過）。
> 一個 change 一個 commit，塊間不分開提交。
>
> **這個 change 與前面每一個都不同**：前面是「加東西」，這一個是「整批換掉」。
> **中間沒有可以停下來的半套狀態**——切到一半的系統是聊天壞掉的系統。
> 因此塊 2～5 必須一次做完才有意義，塊的切分只是為了讓驗證有中繼點。
>
> **塊的依賴**：
> 塊 1（資料清除）必須先做，否則後面的測試會撞到指向 `members` 的舊資料。
> 塊 2（停權拆兩支）與塊 3（WS + 前台端點）互相獨立。
> 塊 4（後台審閱改資料來源）依賴塊 2 的 use case 拆分。
> 塊 5（測試改寫）是工作量的主體，也是唯一能證明切換成功的東西。
>
> **本 change 沒有 schema migration**（沒有欄位變動），但**有破壞性的資料清除**。

## 1. 資料清除（破壞性，需使用者確認）

> **結論：不需要執行，因為沒有東西要清。** 動手之前先數過（唯讀查詢）：
> 開發庫 `nexus_db` 的六張聊天表**全部是 0 筆**，Redis 也沒有任何 dev 的
> presence key（唯一存在的 `integration:presence:online-members` 是整合測試的前綴）。
>
> **先數再刪這件事本身要保留**：如果當時真有資料，這個計數就是「使用者要不要保」
> 的決策依據；而「反正是測試資料」是一個沒有被驗證過的假設。

- [x] 1.1 ⭐⭐ **先取得使用者的明確確認再執行。**
      改為先做唯讀計數——結果是 0，沒有需要確認的破壞性動作
- [x] 1.2 ~~清空聊天相關的表~~——六張表皆為 0 筆，無需執行。
      （真要清時順序是**子表先於房間**，外鍵都指向房間，反過來會被 onDelete 卡住）
- [x] 1.3 ⭐ ~~清除 Redis 的 presence 紀錄~~——dev 前綴下沒有任何 presence key
- [x] 1.4 seed 一組前台測試使用者——3a 已建立
      `seeds/20260101000004-seed-test-users.ts`（`user1@` / `user2@` / `suspended@`），
      不需要新增

## 2. 停權拆成兩支

- [x] 2.1 ⭐ 新增 `SUSPEND_FRONT_USER_USE_CASE` 與對應的 service，
      對象是 `users`。**不要在既有的 use case 加側別參數**——
      那會讓每個呼叫端都要記得傳對，而傳錯的後果是停錯人且沒有任何錯誤訊息
- [x] 2.2 ⭐ ~~撤銷連線也要拆~~ **與 design.md D2 不同的做法（見該檔的「實作時的修正」）**：
      `RevokeMemberSessionsService` 只做「對個人房間廣播再斷線」，不查任何帳號表，
      複製一份只會得到兩份會漂移的相同程式碼。改為把它的 provider 從
      `admin/member.module` 移到 `ChatWsModule` 並 export，兩個停權入口拿到同一份
- [x] 2.3 `ModerationFacade` 的 `suspendMember` / `reinstateMember` 改指向新的 use case
- [x] 2.4 ⭐ **移除「不可停權自己」的檢查**（僅限審閱側）：管理員與前台使用者是
      兩個不相交的身分空間，管理員不可能是自己要停權的那個前台使用者。
      帳號管理側的保護**保留**
- [x] 2.5 `users` 的停權要能寫回 `status` 並遞增 `tokenVersion`——
      後者是「立即讓所有裝置失效」的唯一機制。寫入方法放在**新的 `SaveUserPort`**
      而非 `LoadUserPort`：沿用 `member/` 既有的 Load／Save 拆分，
      把寫入掛在一個叫 Load 的介面上等於讓每個只想查東西的地方都拿到改東西的能力。
      冪等由**條件式更新**回答（`where` 帶 `status`），不是先讀再寫——
      後者有兩個請求同時通過的窗口，結果是同一次停權寫兩筆稽核
- [x] 2.6 單元測試：停權寫 status + 遞增 tokenVersion + 撤銷連線 + 寫稽核；
      重複停權冪等；傳入不存在的 ID → `MEMBER_NOT_FOUND`
- [x] 2.7 驗證：`cd apps/api && pnpm test` 全綠（592 + 183，exit 0）

## 3. WS 與前台端點改用前台身分

- [x] 3.1 ⭐ `ChatGateway` 的 `RESOLVE_MEMBER_CONTEXT_USE_CASE` 改為
      `RESOLVE_USER_CONTEXT_USE_CASE`，`AuthenticatedSocket.member` 改為
      `UserContext`（欄位名可保留 `member`，但型別要換——**改名會波及所有 handler**，
      而這個 change 已經夠大了）
- [x] 3.2 `ChatWsModule` 改 import `FrontAuthModule`（它 export 了 resolver）
- [x] 3.3 ⭐ 三支前台 chat controller 掛 `FrontJwtAuthGuard`，
      `@CurrentMember()` 改為 `@CurrentUser()`
- [x] 3.4 ⭐ 新增守則：`front/` 下的受保護 controller **必須掛 `FrontJwtAuthGuard`**。
      漏掛的後果是一支吃錯 token 的端點，而它看起來完全正常。
      合成輸入測試：掛了 → 通過；沒掛且非 `@Public` → 抓出
- [x] 3.5 `cache-keys.ts` 的 presence 註解寫明「這裡的 member 指的是前台使用者」——
      key 的格式不改（見 design.md D3），但命名的債至少要是**有標記的**債
- [x] 3.6 驗證：`pnpm build` 乾淨（module 接線改了）——exit 0
- [x] 3.7 ⭐ **計畫外**：`CreateDirectRoomService` / `CreateGroupRoomService`
      也吃 `LOAD_MEMBER_PORT`（用 `findActiveMemberIds` 檢查對方存在且啟用）。
      tasks.md 原本只列了審閱側的四支，漏了這兩支。改為 `LoadUserPort.findActiveUserIds`——
      漏改的後果是「建房間時檢查的是後台帳號」：拿前台使用者的 ID 一律查不到，
      症狀會是所有私聊都建不起來（404），而錯誤訊息指向「對象不存在」

## 4. 後台審閱改資料來源

- [x] 4.1 ⭐ 四支補 email 的 service 從 `LoadMemberPort` 改為 `LoadUserPort`：
      `ListReportsService` / `GetReportDetailService` /
      `ListMemberReportsService` / `GetRoomDetailService`
- [x] 4.2 `GetMemberProfileService` 改查 `users`——它回的是**前台使用者**的概覽
- [x] 4.3 儀表板的 `totalMembers` 改計前台使用者數
- [x] 4.4 ⭐ `LoadUserPort` 需要 `findEmailsByIds` 與 `countUsers`，
      **沿用 `LoadMemberPort` 既有的形狀**（回傳 Map、查不到的 id 不出現在對照中）
- [x] 4.5 ⭐ **不要為此抽出共用的「補 email」抽象**——兩張表的查詢條件不同
      （`users` 沒有 `deletedAt` 以外的過濾），而共用會需要一個表名參數，
      那比重複三行更難讀
- [x] 4.6 單元測試：四支 service 查的是 `users`；查不到 → `null`；一頁只查一次
- [x] 4.7 驗證：`cd apps/api && pnpm test` 全綠（exit 0）

## 5. 測試改寫（工作量的主體）

- [x] 5.1 ⭐ 所有聊天相關的 e2e 與整合測試改用 `seedUser` 而非 `seedMember`，
      並用**前台 token** 建立連線。涵蓋：`chat-room` / `chat-message` /
      `chat-report` / `moderation` / `dashboard` 的 e2e，
      以及 `ws-messaging` / `ws-cross-instance` / `ws-session-revocation` /
      `ws-connection-throttle` / `presence-index` 的整合測試
- [x] 5.2 ⭐ **不要用「同時支援兩種」的過渡寫法**——那會讓測試看起來仍然通過，
      卻不再驗證真正的路徑。改就一次改完
- [x] 5.3 ⭐ e2e：**用後台 token 建立 WS 連線 → 被拒絕**。
      這是切換成功的直接證據
- [x] 5.4 ⭐ e2e：**用後台 token 打 `/api/front/chat-rooms` → 401**
      （3a 時這裡是 200，本 change 之後必須是 401）
- [x] 5.5 e2e：審閱頁看到的 email 來自 `users`——建一個同 email 的 member
      與 user，斷言拿到的是 user 的那筆
- [x] 5.6 ⭐ **反向驗證**：把 4.1 的其中一支改回查 `members` → 5.5 要紅；
      把 3.3 的 guard 拿掉 → 5.4 要紅。兩者還原後都要綠
- [x] 5.7 驗證：`test:e2e` 322 passed / exit 0（`TZ=UTC`）、`test:integration` 56 passed / exit 0

## 6. 收尾

- [x] 6.1 完整驗證鏈全部 exit 0：`typecheck` / `lint` / `test:cov`（592 + 183）/
      `build` / `test:e2e`（322，`TZ=UTC`）/ `test:integration`（56）/ `swagger:check`
- [x] 6.2 `smoke-test.md`：用前台帳號實際聊一次天，並從後台審閱看到**前台使用者的 email**。
      **含一項只有人工驗得到的**：用後台 token 開 `ws:client`，確認連不上
- [x] 6.3 `openspec/project.md` 與 `project/backend-runtime.md`：
      把「聊天的參與者是前台使用者」寫進去，並更新停權的兩個入口
- [x] 6.4 更新 `tasks/todo.md`：路線圖第 4 項打勾；
      **寫明第 5 項（後台的前台使用者管理）解除了「進入點只有檢舉」的限制**
- [x] 6.5 新踩到的坑寫進 `tasks/lessons.md`（四條）。
      **這一條要寫**：做 M2 之前沒有先問「聊天的使用者是誰」，
      而那個問題如果早問，分表會在第一天發生
- [x] 6.6 `openspec archive migrate-chat-to-front-users`
