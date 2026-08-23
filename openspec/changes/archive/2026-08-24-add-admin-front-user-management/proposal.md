## Why

分表之後，後台**沒有任何一支端點能列出前台使用者**。目前唯一的進入點是檢舉——
`add-admin-member-profile` 的 D6 明白寫著「只從檢舉點進去，Sidebar 沒有入口」，
那在當時是對的（成員概覽是審閱的一部分），但現在的後果是：

- **找不到沒被檢舉過的人**。要處理一個剛註冊就在洗版的帳號，得先等有人檢舉他。
- **不能主動停權**。停權的入口掛在檢舉詳情頁裡。
- **看不到帳號面的事實**——`emailVerifiedAt`、`lastSeenAt`、`avatarUrl` 目前
  沒有任何地方顯示得出來，而它們正是判斷「這是不是一個機器人帳號」要看的東西。

`add-front-user-registration`（3b）會讓這個缺口變大：帳號開始自己長出來之後，
「後台看不到全部使用者」從不方便變成失控。

## What Changes

- **新增 `BACKEND:FRONT_USER:VIEW` / `BACKEND:FRONT_USER:EDIT` 兩個權限碼**，
  與後台帳號（`BACKEND:ACCOUNT:*`）、檢舉審閱（`BACKEND:MODERATION:*`）都分開。
- **新增四支後台端點**（`/api/admin/front-users/*`）：列表（分頁 + email/顯示名稱模糊搜尋
  + 狀態與信箱驗證過濾）、詳情、停權、解除。
- **新增強制登出**（`POST /front-users/:id/force-logout`）：遞增 `tokenVersion`
  並斷開既有連線，但**不停用帳號**。用於「帳號可能外洩」——那與「這個人違規」是兩件事。
- **停權／解除多一個入口**：與審閱側呼叫**同一個 use case**，差別只在權限碼與稽核 action。
- **新增稽核 action `MEMBER_FORCE_LOGGED_OUT`**（Prisma enum + DB enum，需要 migration）。
- **新增後台頁面** `/front-users` 列表與 `/front-users/:id` 詳情，Sidebar 加一個入口。

**不做**：

- **編輯 displayName / avatarUrl**——那是代替使用者改他自己的資料，
  一條不容易收回的線。真的要做時它是一個獨立的決定，不該夾帶在「看得到」裡面。
- **刪除帳號**——`users` 有 `deletedAt`，但聊天資料沒有外鍵指向它。刪了之後
  那些訊息與檢舉的當事人會變成查不到的 ID，顯示成「帳號已刪除」。
  要做得先決定那個語意，不是加一支 DELETE 就好。
- **重設密碼 / 代替登入**——前者要等 3b 的密碼重設流程，後者是另一種東西。
- **擴充既有的 `GET /moderation/members/:id`**——見 design.md D2。

## Capabilities

### New Capabilities

- `api-user-management`：後台管理**前台使用者**的 REST 契約——列表、詳情、強制登出。
  名稱不用 `api-front-user-*`：`api-front-` 這個前綴被保留給**前台自己的**端點
  （`api-front-auth`、`api-front-chat-*`），而這幾支是後台端點。
- `ui-user-management`：後台的前台使用者列表與詳情頁、Sidebar 入口、依權限的顯示差異。

### Modified Capabilities

- `api-account-suspension`：新增「從會員管理側停權／解除」兩條需求。
  對象與 use case 與審閱側完全相同，差別只在權限碼與進入點。

## Impact

- **DB**：`ChatAuditAction` enum 新增 `MEMBER_FORCE_LOGGED_OUT`——**需要 migration**
  （`ALTER TYPE ... ADD VALUE`，見 design.md D4 的 PostgreSQL 注意事項）。
  **沒有新表、沒有欄位變動。**
- **權限**：`PermissionCode` 與 `PERMISSION_CATALOG` 各加兩筆，seed 會 upsert 進去。
  **既有角色不會自動獲得新權限**——要由 SUPERADMIN 在角色管理裡勾選（見 design.md D5）。
- **後端**：新的 `admin/front-user` 模組（controller / facade / service / port），
  `LoadUserPort` 增加列表查詢，`SaveUserPort` 增加 `bumpTokenVersion`。
- **前端**：`apps/web` 新增兩個路由與一個 Sidebar 項目；api-client 重新產生。
- **無新環境變數。**
- **停權的行為不變**：既有的審閱側入口與它的所有測試都不動。
