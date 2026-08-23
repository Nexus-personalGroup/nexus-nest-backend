> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由加 `pnpm --filter @app/api test:e2e`；
> 動到 module 接線加 `pnpm build`；
> 動到 swagger yaml 加 `swagger:bundle` + `api-client generate`。
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（migration + 權限碼）必須先做——後面每一塊都用得到那兩個權限碼，
> 而 `MEMBER_FORCE_LOGGED_OUT` 沒進 enum 的話塊 3 連編譯都過不了。
> 塊 2（讀取端）與塊 3（處置端）互相獨立，可分開驗證。
> 塊 4（前端）依賴塊 2、3 的 api-client 產物。
>
> **與 `migrate-chat-to-front-users` 的關係**：停權的 use case 已經存在，
> 這裡**只加入口不改行為**。既有的審閱側端點與它的所有測試一律不動——
> 動到了就是做錯了。

## 1. Migration、權限碼與 port

- [x] 1.1 `schema.prisma` 的 `ChatAuditAction` enum 加 `MEMBER_FORCE_LOGGED_OUT`，
      同步加進 `ChatAuditPort` 的 `ChatAuditAction` 聯集型別（兩邊都要，缺一不可）
- [x] 1.2 ⭐ `pnpm --filter @app/api db:migrate --name add_force_logout_audit_action`
      （**不要加 `--` 分隔符**，prisma 會忽略 `--name` 然後進互動模式，
      中斷它會留下 advisory lock）。確認產出的 SQL 只有 `ALTER TYPE ... ADD VALUE`
- [x] 1.3 `PermissionCode` 加 `BACKEND_FRONT_USER_VIEW` / `BACKEND_FRONT_USER_EDIT`，
      `PERMISSION_CATALOG` 加對應的顯示名（`後台-前台會員-檢視` / `-編輯`）
- [x] 1.4 ⭐ **一般角色不自動配給新權限**（design D5），上線後由 SUPERADMIN 勾選
- [x] 1.4b ⭐ **計畫外，但不做的話這個 change 等於沒上線**（見 design D5 的「實作時發現的洞」）：
      `seed-runner` 依 `seed_history` 讓每個 seed 一輩子只跑一次，
      於是新增的權限碼**永遠進不了既有資料庫**；而 SUPERADMIN 的角色是 `isDefault`，
      UI 上改不了（`DefaultRoleNotEditableException`）——**沒有任何人拿得到新權限，
      且完全沒有錯誤訊息**。改法：seed 支援 `export const alwaysRun = true`，
      套用在 `seed-permissions` 與 `seed-roles`（兩者都只 upsert，不移除既有授權）
- [x] 1.5 `LoadUserPort` 加 `listUsers(params)`（回 `{ data, total }`，形狀沿用
      `LoadMemberPort.listMembers`）與 `loadDetailById(id)`——
      ⭐ **後者的 select MUST NOT 含 `password`**。既有的 `loadById` 帶 password
      是認證流程需要，顯示路徑不可以共用它
- [x] 1.6 `SaveUserPort` 加 `bumpTokenVersion(id)`，回傳是否命中（軟刪除的算沒命中）
- [x] 1.7 `PrismaUserRepository` 實作三支；驗證：`cd apps/api && pnpm test` 全綠

## 2. 讀取端（列表與詳情）

- [x] 2.1 in-port `FrontUserQueryUseCases.ts`：`LIST_FRONT_USERS_USE_CASE`、
      `GET_FRONT_USER_USE_CASE` 與其查詢／視圖型別
- [x] 2.2 `ListFrontUsersService` / `GetFrontUserService`（TDD，mock port）
- [x] 2.3 DTO 由 zod 推導：`status` / `verified` 都用 `z.enum(['true','false'])`
      嚴格解析，**省略即不過濾**。`verified=true` 對應 `emailVerifiedAt != null`
- [x] 2.4 `FrontUserController`（`admin/front-users`）+ `FrontUserFacade` + module。
      ⭐ 掛 `@Permissions(BACKEND_FRONT_USER_VIEW)`——**不要沿用 ACCOUNT 或 MODERATION**
- [x] 2.5 ⭐ 單元測試：查的是 `users` 不是 `members`；`password` 不在回傳裡；
      軟刪除不出現；三個過濾條件取交集
- [x] 2.6 Swagger yaml + `swagger:bundle` + `api-client generate`
- [x] 2.7 驗證：`pnpm test` 與 `pnpm build` 皆 exit 0

## 3. 處置端（停權／解除／強制登出）

- [x] 3.1 ⭐ 停權與解除**直接注入既有的 `SUSPEND_FRONT_USER_USE_CASE` /
      `REINSTATE_FRONT_USER_USE_CASE`**，不新增 service、不改它們的任何一行。
      改到了就是做錯了——兩個入口的行為必須完全一致
- [x] 3.2 新增 `FORCE_LOGOUT_FRONT_USER_USE_CASE` 與 `ForceLogoutFrontUserService`：
      遞增 `tokenVersion` + 撤銷 WS 連線 + 寫 `MEMBER_FORCE_LOGGED_OUT` 稽核，
      ⭐ **不動 `status`**
- [x] 3.3 ⭐ 強制登出**刻意不冪等**：每次呼叫都遞增並寫稽核。
      「再登出一次」是有意義的重複動作，做成冪等會讓第二次靜默無效
- [x] 3.4 module 接線：`UserPersistenceModule`（讀寫）、`ChatWsModule`
      （`REVOKE_MEMBER_SESSIONS_USE_CASE`）、`ChatRoomCoreModule`（`CHAT_AUDIT_PORT`）、
      `ModerationModule` 的兩支停權 use case。
      ⭐ 若為了拿停權 use case 而要 import `ModerationModule`，先確認沒有循環相依；
      有的話把兩支 use case 的 provider 下沉到共用模組（**不要複製一份實作**）
- [x] 3.5 單元測試：強制登出不動 status、對已停權的帳號仍有效、連兩次遞增 2 次、
      稽核的執行者是管理員而對象是使用者
- [x] 3.6 Swagger yaml + bundle + generate
- [x] 3.7 驗證：`pnpm test` 全綠

## 4. E2E

- [x] 4.1 三組權限的交叉矩陣：`FRONT_USER:VIEW` / `FRONT_USER:EDIT` /
      `MODERATION:*` / `ACCOUNT:*`。⭐ **只有 MODERATION 或只有 ACCOUNT 都要 403**——
      這是 D1 的直接證據
- [x] 4.2 ⭐ 列表裡沒有 `members`：同時 seed 兩張表，斷言清單只有 `users` 的那些
- [x] 4.3 ⭐ 回應不含 `password`：`JSON.stringify(res.body)` 不得含 bcrypt 雜湊的前綴
- [x] 4.4 ⭐ **兩個入口效果一致**：從 `/front-users/:id/suspend` 停權 A、
      從 `/moderation/members/:id/suspend` 停權 B，斷言 status／tokenVersion／
      稽核 action 完全相同
- [x] 4.5 ⭐ 強制登出：舊 token 打前台端點 → 401；重新登入 → 成功；`status` 仍為 true
- [x] 4.6 過濾條件：`verified=false` 只回未驗證的；`status` 與 `email` 取交集；
      `status=yes` → 400
- [x] 4.7 ⭐ **反向驗證**（三項皆破壞後紅、還原後綠）：
      (a) 把列表改查 `memberRecord` → 4.2 要紅；
      (b) 把 `loadDetailById` 的 select 加回 `password` → 4.3 要紅；
      (c) 把強制登出改成同時寫 `status: false` → 4.5 要紅。
      三者還原後都要綠
- [x] 4.8 驗證：`TZ=UTC pnpm --filter @app/api test:e2e` exit 0

## 5. 前端

- [x] 5.1 `_nav-items.ts` 加一筆：標籤 **「前台會員」**（⭐ 不能叫「會員」——
      `/members` 已經叫「會員管理」，兩個都叫會員會讓人在錯的體系裡找人），
      群組「使用者與權限」，`requiredPermission: 'BACKEND:FRONT_USER:VIEW'`
- [x] 5.2 `/front-users` 列表頁：搜尋 + 兩個過濾 + 分頁，條件寫進 URL query。
      頭像為 null 時顯示首字替代圖示
- [x] 5.3 ⭐ `lastSeenAt` 標示語意為「最後登入」而非「最後上線」——
      它目前只在登入與換發 token 時更新（design 的 Open Questions）
- [x] 5.4 `/front-users/:userId` 詳情頁：帳號面欄位 + 三個動作。
      ⭐ 停權／解除要二次確認並說明後果；**強制登出不要**（可逆）；
      兩者**不並排**——圖示與文案相近，按錯的成本不對稱
- [x] 5.5 ⭐ ~~缺 `FRONT_USER:EDIT` 時三個動作**不顯示**~~ —— **反過來，照既有慣例**：
      `ui-moderation` 已經明文規定「處置動作 MUST disabled 並以 tooltip 說明
      『無處置權限』，MUST NOT 隱藏——隱藏會讓人以為功能不存在」。
      我的 spec 原本寫了相反的規則，改 spec 而不是改實作。
      **導覽仍然是隱藏**（Sidebar、審閱紀錄連結）：點進去只會得到無權限畫面
- [x] 5.6 ⭐ 同時具備 `MODERATION:VIEW` 時顯示「查看審閱紀錄」連結；沒有就不顯示。
      **不要把審閱資料搬進本頁**（design D2）
- [x] 5.7 元件測試：權限差異（VIEW-only 看不到動作、無 MODERATION 看不到連結）、
      停權的二次確認、空清單與找不到使用者的空狀態
- [x] 5.8 驗證：`cd apps/web && pnpm test` 與 `pnpm build` 皆 exit 0

## 6. 收尾

- [x] 6.1 完整驗證鏈全部 exit 0：`typecheck` / `lint` / `test:cov`（api 607+183、web 111）/
      `build` / `test:e2e` 353（`TZ=UTC`）/ `test:integration` 56 / `swagger:check`
- [x] 6.1b **計畫外**：`detail.yaml` 原本用 `allOf` 併入共用的 `_front-user.yaml`，
      導致 api-client 產出的型別指進一個解不開的位置（只有 web 的 typecheck 抓得到）。
      共用 schema **只能被一處 `$ref`**，第二處要 inline——
      `moderation/room-detail.yaml` 的註解裡早就記著這個坑。順便拿掉了沒有消費者的
      `updatedAt`（本 change 不提供編輯，而 `updated_at` 幾乎等於 `lastSeenAt`）
- [x] 6.2 `smoke-test.md`：⭐ **第一步是用 SUPERADMIN 到角色管理勾選新權限**——
      在那之前選單不會出現在任何人的 Sidebar 上（design D5）。
      再驗停權／解除／強制登出三者的差異
- [x] 6.3 `openspec/project.md` 與 `project/backend-runtime.md`：
      補上第三組權限碼與「停權有三個入口、共用同一個 use case」
- [x] 6.4 更新 `tasks/todo.md`：第 5 項打勾，並**刪掉「進入點只有檢舉」那個限制的記載**
- [x] 6.5 新踩到的坑寫進 `tasks/lessons.md`（兩條）
- [x] 6.6 ⭐ `openspec archive add-admin-front-user-management`，
      並**檢查三份 master spec 的 `## Purpose` 有沒有跟新合併的 Requirements 打架**——
      archive 只合併 `## Requirements`，不動 Purpose
- [x] 6.7 ⭐ **需要使用者手動執行**：部署後跑 `db:migrate:deploy` 與 `db:seed`，
      再以 SUPERADMIN 勾選角色權限。三步都做完新頁面才會出現
