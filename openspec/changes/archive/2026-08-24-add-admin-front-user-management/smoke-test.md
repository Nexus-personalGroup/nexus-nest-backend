# 手動驗證：後台的前台會員管理

> 前置：`pnpm dev` 已啟動（**由你啟動**）。
>
> 這份清單只驗**自動化測試驗不到的三件事**：
> 權限要先設定才看得到頁面、兩個詳情頁各自回答什麼問題、
> 以及「強制登出」和「停權」在畫面上分不分得開。

## 0. ⭐ 先確認權限進得去（沒有這一步，後面全部看不到）

新的權限碼是 `BACKEND:FRONT_USER:VIEW` / `BACKEND:FRONT_USER:EDIT`。
**它們不會自動配給任何一般角色**——這是刻意的（design D5）。

`seed-permissions` 與 `seed-roles` 已改為 `alwaysRun`，所以：

```bash
pnpm --filter @app/api db:migrate:deploy   # 只加一個 enum 值
pnpm --filter @app/api db:seed             # 兩支 catalog seed 會重跑
```

跑完之後確認：

```bash
ADMIN=$(curl -s -X POST http://localhost:3000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"Admin1234!"}' | jq -r .data.accessToken)

curl -s http://localhost:3000/api/admin/me -H "Authorization: Bearer $ADMIN" \
  | jq '.data.permissions | map(select(startswith("BACKEND:FRONT_USER")))'
# 期望：["BACKEND:FRONT_USER:VIEW","BACKEND:FRONT_USER:EDIT"]
# **拿到空陣列的話後面全部不用做了**——先查 seed 有沒有真的重跑
```

**要給其他角色用的話**：以 SUPERADMIN 登入 → 角色管理 → 編輯該角色 → 勾選這兩個。
（SUPERADMIN 自己的角色是 `isDefault`，UI 上改不了，所以它靠上面的 seed 拿到。）

## 1. Sidebar 只在有權限時出現

以 `admin@test.com` 登入後台，左側「使用者與權限」群組應該有**兩個**項目：

- **會員管理** → `/members`（後台帳號）
- **前台會員** → `/front-users`（聊天的使用者）← 新的

⚠️ **確認兩個標籤分得開**。這是刻意的命名——兩個都叫「會員」的話，
在錯的體系裡找人會找不到，而畫面上看不出哪裡錯了。

拿一個**沒有** `BACKEND:FRONT_USER:VIEW` 的帳號登入（例如只給 MODERATION 的角色），
「前台會員」不該出現；直接打 `/front-users` 應該被導回首頁。

## 2. 列表：搜尋、過濾、URL 保留

進 `/front-users`，seed 有三個帳號（`user1@` / `user2@` / `suspended@`）。

- 輸入 email 關鍵字 → 清單即時縮小，**網址列出現 `?email=...`**
- 「帳號狀態」選「停用」→ 只剩 `suspended@test.com`
- 「信箱驗證」選「未驗證」→ 三個都在（seed 沒有驗證任何一個）
- 切到第 2 頁再**重新整理** → 條件與頁碼都還在
- 「重置」→ 條件清空，網址回到乾淨的 `/front-users`

⚠️ **確認清單裡沒有 `admin@test.com`**。那是後台帳號，不該出現在這裡——
查錯表的症狀就是一份看起來完全正常、只是列了另一群人的清單。

⚠️ 把游標移到「最後登入」的 ⓘ 上，確認寫的是
「最後一次登入或換發憑證的時間，不等於最後上線時間」。

## 3. 詳情頁：兩頁分工

點任一列的「檢視」進 `/front-users/:id`。

應該看到：Email、帳號狀態、信箱驗證、註冊時間、最後登入。
**不該看到**任何檢舉次數、聊天室清單或訊息——那些在審閱側。

以同時有 `MODERATION:VIEW` 的帳號登入時，下方會有一張「聊天行為」卡片
與「查看審閱紀錄」連結，點下去到 `/moderation/members/:id`。
以**沒有** MODERATION 權限的帳號登入時，**整張卡片都不該出現**。

## 4. ⭐ 強制登出與停權在畫面上分得開

這是這一頁最容易出事的地方——兩個動作的圖示與文案相近，但後果不對稱。

確認版面：

- 「強制登出所有裝置」在**一般動作**區，底下有一行說明含「**帳號仍可使用**」
- 「停權」在一個**有紅框的危險操作**區塊，與上面分開
- 兩者**不並排**

行為：

```bash
# 先讓 user1 登入前台並拿到 token
FRONT=$(curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user1@test.com","password":"User1234!"}' | jq -r .data.accessToken)
```

**強制登出**（畫面上點下去，不該跳確認對話框）：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/front/me \
  -H "Authorization: Bearer $FRONT"
# 期望：401（舊憑證失效）

curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user1@test.com","password":"User1234!"}' | jq -r '.success'
# 期望：true——**帳號沒被停用**，重新登入就能用
```

回到詳情頁確認**帳號狀態仍是「啟用中」**。

**停權**（點下去**必須**跳確認對話框，且對話框要說明「無法登入 + 連線會中斷」）：

```bash
curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user1@test.com","password":"User1234!"}' | jq -r '.code'
# 期望：帳號已停用的錯誤碼——這才是停權與強制登出的差別
```

確認畫面**不用手動重整**就變成「已停權」，動作也換成「解除停權」。

## 5. 只有檢視權限時

用一個只有 `BACKEND:FRONT_USER:VIEW`（沒有 EDIT）的角色登入：

- 列表與詳情都看得到
- 三個動作**是 disabled 的、仍然看得見**，游標移上去顯示「無處置權限」
- ⚠️ **不該是「整個不見」**——隱藏會讓人以為功能不存在，然後跑來問
  「為什麼我不能停權」。這與檢舉審閱的處置動作是同一個判準。

## 6. 稽核有留下痕跡

```bash
curl -s "http://localhost:3000/api/admin/moderation/members/<userId>/timeline" \
  -H "Authorization: Bearer $ADMIN" | jq '.data.list | map(.action)'
```

停權會是 `MEMBER_SUSPENDED`、強制登出是 `MEMBER_FORCE_LOGGED_OUT`。

⚠️ **確認強制登出不是寫成 `MEMBER_SUSPENDED`**——用停權代替強制登出
會在稽核裡留下一筆不實的違規紀錄，而稽核的用途正是事後回答
「這個人被怎麼對待過」。

> 註：時間軸查的是「這個前台使用者**做過**什麼」（`member_id`），
> 而管理員對他做的事記在 `target_member_id` 那一側。上面這個查詢看得到的是
> 前者，要驗後者請直接查 `chat_audit_logs`。
