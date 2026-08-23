## Context

路線圖第 5 項。`migrate-chat-to-front-users` 把聊天的身分切到 `users` 之後，
後台能對前台使用者做的事全部掛在檢舉底下——找不到沒被檢舉過的人、不能主動停權。
這個 change 補上那個進入點。

工程上它不難（形狀與既有的帳號管理幾乎一樣），**真正要想清楚的是邊界**：
哪些事後台可以做、哪些不行，以及新權限碼要切在哪裡。

## Goals / Non-Goals

**Goals:**

- 後台能**不經由檢舉**找到任何一個前台使用者，包含從未被檢舉過的。
- 能看到帳號面的事實：信箱是否驗證、最後活動時間、頭像、建立時間、停權狀態。
- 能主動停權／解除，以及在「帳號可能外洩」時強制登出。
- 授權與後台帳號管理、檢舉審閱**三者互不相通**。

**Non-Goals:**

- **不改前台使用者的任何個資**（displayName / avatarUrl / email）。
- **不刪除帳號**。
- **不看訊息內容**——那條界線由 `api-moderation` 守著，本 change 不碰。
- **不做批次操作**（批次停權、匯出）。沒有實際需求，而批次停權的誤操作是不可逆的。
- **不動既有的審閱側停權入口**，包含它的錯誤碼與稽核。

## Decisions

### D1：新開 `BACKEND:FRONT_USER:*`，不沿用既有的兩組

三個候選：

| 做法 | 評估 |
| --- | --- |
| **新開 `FRONT_USER:VIEW/EDIT`** | 前台使用者是獨立的帳號體系，權限也該是。多兩個碼要維護 |
| 沿用 `ACCOUNT:VIEW/EDIT` | 「能管後台帳號的人」自動能管前台使用者。兩件事的風險不同——後台帳號是同事，前台使用者是客戶 |
| 沿用 `MODERATION:VIEW/EDIT` | 「能查會員名單」自動「看得到被撤回的訊息內容」。後者是本專案刻意收緊過的東西 |

選第一個。判準與既有的 `MODERATION` 拆分一致：**「能看的人」與「能判的人」
在真實團隊裡經常不是同一群**，而這裡多一層——「能查客戶名單的客服」
與「能看檢舉內容的審閱者」也經常不是同一群。

**VIEW / EDIT 分開**的理由同 `MODERATION`：查名單接觸到的是個資（email、最後活動時間），
停權改變的是別人能不能用這個服務。

### D2：詳情頁新開一支端點，不擴充既有的成員概覽

既有的 `GET /admin/moderation/members/:id` 回**八個欄位**，
而且 `add-admin-member-profile` 為此寫了一支測試釘住「**只帶 email，不帶其他帳號資料**」——
理由是本端點的授權是 `MODERATION:VIEW`，帶出帳號管理的資料等於繞過另一個權限的邊界。

**把 `displayName` / `lastSeenAt` / `emailVerifiedAt` 補進去，就是自己把那條界線拆掉。**

因此新開 `GET /api/admin/front-users/:id`，要 `FRONT_USER:VIEW`，回帳號面的資料。
兩支並存，各自回答不同的問題：

| 端點 | 問題 | 權限 |
| --- | --- | --- |
| `GET /moderation/members/:id` | 這個人在聊天裡做了什麼？被檢舉幾次？ | `MODERATION:VIEW` |
| `GET /front-users/:id` | 這個帳號是什麼狀態？驗證了嗎？多久沒上線？ | `FRONT_USER:VIEW` |

**前端兩個頁面也不合併。** 同時擁有兩個權限的人在詳情頁會看到一個
「查看審閱紀錄」的連結，而不是把兩份資料塞進同一頁——後者會讓
「這一區要哪個權限才看得到」變成頁面內部的隱藏規則。

### D3：停權走**同一個 use case**，只是多一個入口

`SUSPEND_FRONT_USER_USE_CASE` / `REINSTATE_FRONT_USER_USE_CASE` 已經存在
（`migrate-chat-to-front-users` 建的），對象正是 `users`。這裡**不新增 use case**，
只新增 controller 端點並掛不同的權限碼。

這與 D1 的「權限要分開」不衝突——**分開的是授權，不是行為**。
兩個入口停權的效果必須完全相同（狀態、`tokenVersion`、斷線、稽核），
各自實作才會讓行為分歧，而分歧的那一邊不會有人發現。這正是
`api-account-suspension` 的 Purpose 從第一天就寫著的東西。

**稽核的 action 也相同**（`MEMBER_SUSPENDED` / `MEMBER_REINSTATED`）：
稽核記的是「發生了什麼」，不是「從哪個畫面按的」。要區分入口的話，
正確的做法是加一欄來源而不是分裂 action 的語意——而目前沒有那個需求。

### D4：強制登出是獨立的動作，不是「停權再解除」

**現象上它們很像**（都會讓所有裝置失效），但語意完全不同：

- **停權** = 這個人違規，我們不讓他用。帳號 `status` 變 false，他重新登入也進不來。
- **強制登出** = 這個帳號可能被別人拿到了。`status` 不變，他重新登入就能繼續用。

用「停權再解除」代替強制登出會在稽核裡留下一筆**不實的違規紀錄**，
而稽核的用途正是事後回答「這個人被怎麼對待過」。

因此新增 use case `FORCE_LOGOUT_FRONT_USER_USE_CASE`：遞增 `tokenVersion`、
撤銷 WS 連線、寫 `MEMBER_FORCE_LOGGED_OUT` 稽核，**不動 `status`**。

**⚠️ Prisma enum 的 migration 注意事項**：PostgreSQL 的
`ALTER TYPE ... ADD VALUE` 在 PG 12 以上可以在交易內執行，
但**新加的值不能在同一個交易裡被使用**。本次只加值、不回填資料，因此沒有問題；
若日後有「加值 + 用它更新既有資料」的 migration，必須拆成兩個檔案。

**冪等**：對已停權的帳號強制登出仍然有效（`tokenVersion` 照樣遞增）——
兩件事互相獨立，沒有理由讓其中一個擋住另一個。

### D5：新權限碼只自動配給 SUPERADMIN，其餘角色要手動勾選

新權限碼**不自動配給任何一般角色**：自動配給的話「誰能看客戶名單」
會在一次部署中悄悄改變，而那是一個沒有人按下同意的授權擴張。
上線後要由 SUPERADMIN 到角色管理裡勾選——寫進 tasks 的收尾與 PR 的「相依」段。

#### 實作時發現的洞：原本的寫法會讓**沒有任何人**拿得到新權限

D5 原本假設「由 SUPERADMIN 勾選」是做得到的。實際追下去發現**做不到**，
而且失敗是完全靜默的：

1. `seed-runner` 依 `seed_history` 判斷，**每個 seed 檔一輩子只跑一次**。
   於是在任何已經跑過 seed 的資料庫上，新增的權限碼**永遠進不了 `permissions` 表**。
2. 就算進得去，`seed-roles` 宣告 SUPERADMIN =「全部權限」，但它也被跳過，
   所以 SUPERADMIN 不會拿到新碼。
3. SUPERADMIN 的角色是 `isDefault: true`，`UpdateRoleService` 直接
   `throw new DefaultRoleNotEditableException()`——**UI 上改不了**。

三者疊起來的結果：這個 change 會上線一個**沒有任何人進得去的頁面**，
而且不會有任何錯誤訊息——選單只是不出現。

**修法**：讓 seed 支援 `export const alwaysRun = true`，並套用在
`seed-permissions` 與 `seed-roles` 上。判準不是「這個 seed 重不重要」，而是
**它同步的是編譯期常數還是一次性資料**：權限目錄與「預設角色 = 全部權限」
都是前者，會隨程式碼成長；測試帳號是後者。

兩支都只做 upsert、**不移除任何既有授權**，因此重跑不會動到人工調整過的角色。
D5 的原意（一般角色不自動獲得新權限）維持不變——變的只有 SUPERADMIN，
而它本來就宣告自己擁有全部權限。

### D6：列表的搜尋條件涵蓋 `emailVerifiedAt`，不涵蓋 `lastSeenAt`

- **`verified?: boolean`**：未驗證的帳號是機器人的第一個特徵，
  而「列出所有未驗證帳號」是一個會反覆用到的查詢。
- **`lastSeenAt` 只顯示不過濾**：要過濾就得決定「多久算不活躍」，
  那是一個產品決定而不是一個查詢參數。等真的有人要用時再加，
  屆時它應該是「最後活動早於某日期」而不是一個布林。

排序固定 `createdAt DESC`（最新註冊在最前），不開放自訂——
可排序的欄位一旦開放就要為每個欄位建索引，而目前沒有任何一個排序需求。

## Risks / Trade-offs

- **[新權限碼上線後沒有人看得到新頁面]** → 這是 D5 的刻意結果，不是 bug。
  寫進 PR 的「相依」段，並在 smoke-test 的第一步就是「用 SUPERADMIN 勾權限」。
- **[兩個詳情頁讓人困惑「該看哪一個」]** → 各自的標題與空狀態要寫清楚它回答什麼問題；
  詳情頁互相加連結（依權限顯示）。
- **[`ALTER TYPE ADD VALUE` 在部分 PG 版本不能進交易]** → 本專案是 PG 17，
  且本次只加值不用值。已在 D4 記下限制條件。
- **[強制登出與停權在 UI 上太像，容易按錯]** → 強制登出不需要二次確認（可逆），
  停權需要（不可逆到使用者感受得到）。兩者在頁面上分開放，不並排。

## Migration Plan

1. `pnpm --filter @app/api db:migrate --name add_force_logout_audit_action`
   （只加一個 enum 值，無資料變動、可安全回滾——回滾時該值留在 enum 裡不影響任何東西）。
2. `pnpm --filter @app/api db:seed` — 讓兩個新權限碼進 `permissions` 表。
3. **手動**：以 SUPERADMIN 登入 → 角色管理 → 勾選需要的角色。
   在這之前新選單不會出現在任何人的 Sidebar 上。

## Open Questions

- **要不要記錄「誰在什麼時候查過某個使用者的名單／詳情」**：目前不記。
  判準沿用審閱側——列表與帳號面詳情**不含訊息內容**，記了會讓稽核量與「點了幾下」對齊。
  但 email 與最後活動時間仍然是個資，若日後有稽核要求，加的位置是詳情而非列表。
- **`lastSeenAt` 目前只有登入時更新**（`touchLastSeen`），不是真正的「最後活動」。
  詳情頁要標示清楚它的語意，否則會被讀成「最後上線」。真要做得在 WS 心跳或
  presence 那一層更新，那是獨立的一件事。
