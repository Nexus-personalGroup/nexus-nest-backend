# 手動驗證：聊天切換到前台使用者

> 前置：`pnpm dev` 已啟動（**由你啟動**）、資料庫已跑過 seed
> （`pnpm --filter @app/api db:seed`，會建出 `user1@test.com` / `user2@test.com` /
> `suspended@test.com`，密碼都是 `User1234!`）。
>
> 這份清單的重點**不是「聊天還能用」**，而是「**後台身分已經進不來了**」——
> 前者 e2e 都驗過了，後者有一項只有人工才驗得到（見第 5 節）。

## 1. 取兩側的 token

```bash
# 前台（聊天的參與者）
FRONT_A=$(curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user1@test.com","password":"User1234!"}' | jq -r .data.accessToken)

FRONT_B=$(curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user2@test.com","password":"User1234!"}' | jq -r .data.accessToken)

# 後台（審閱者）
ADMIN=$(curl -s -X POST http://localhost:3000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"Admin1234!"}' | jq -r .data.accessToken)

echo "front=${FRONT_A:0:20}… admin=${ADMIN:0:20}…"
```

## 2. ⭐ 後台 token 打前台聊天端點 → 401

**切換之前這裡會回 200。** 這是最直接的一條證據。

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/front/chat-rooms \
  -H "Authorization: Bearer $ADMIN"
# 期望：401
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/front/chat-rooms \
  -H "Authorization: Bearer $FRONT_A"
# 期望：200
```

## 3. 用前台帳號實際聊一次天

```bash
# user1 找 user2 開私聊
USER_B_ID=$(curl -s http://localhost:3000/api/front/me \
  -H "Authorization: Bearer $FRONT_B" | jq -r .data.id)

ROOM=$(curl -s -X POST http://localhost:3000/api/front/chat-rooms/direct \
  -H "Authorization: Bearer $FRONT_A" -H 'Content-Type: application/json' \
  -d "{\"targetMemberId\":\"$USER_B_ID\"}" | jq -r .data.id)

echo "roomId=$ROOM"
```

訊息用 WS 送（REST 沒有送訊息的端點）：

```bash
pnpm --filter @app/api ws:client
```

> `ws:client` 需要一個 access token；把上面的 `$FRONT_A` 貼進去。
> 送一則訊息後，回到 curl 確認它落庫了：

```bash
curl -s "http://localhost:3000/api/front/chat-rooms/$ROOM/messages" \
  -H "Authorization: Bearer $FRONT_A" | jq '.data.list[0] | {content, seq, senderId}'
```

## 4. ⭐ 後台審閱看到的是**前台使用者的 email**

先用 user2 檢舉 user1 的訊息（或反過來），再從後台看佇列：

```bash
MSG=$(curl -s "http://localhost:3000/api/front/chat-rooms/$ROOM/messages" \
  -H "Authorization: Bearer $FRONT_B" | jq -r '.data.list[0].messageId')

curl -s -X POST http://localhost:3000/api/front/chat-reports \
  -H "Authorization: Bearer $FRONT_B" -H 'Content-Type: application/json' \
  -d "{\"messageId\":\"$MSG\",\"reason\":\"HARASSMENT\"}" | jq -r .data.reportId
```

```bash
curl -s http://localhost:3000/api/admin/moderation/reports \
  -H "Authorization: Bearer $ADMIN" \
  | jq '.data.list[0] | {reporterEmail, targetMemberEmail}'
# 期望：兩者都是 user1@test.com / user2@test.com（前台帳號），
#       不是任何一個 @admin 的信箱。查錯表的話這兩欄會是 null
```

儀表板的成員數同理：

```bash
curl -s http://localhost:3000/api/admin/moderation/dashboard \
  -H "Authorization: Bearer $ADMIN" | jq '.data.totalMembers'
# 期望：前台使用者的數量（seed 是 3），不是後台管理員的數量
```

## 5. ⭐ 只有人工驗得到：用後台 token 開 WS 連線

自動化測試裡這條走的是「簽一個 admin token 再連」，
**人工這一條走的是真的登入流程**——它會驗到 e2e 驗不到的東西：
登入回傳的那個 token 到底是不是前台的。

```bash
pnpm --filter @app/api ws:client
```

貼上**第 1 節的 `$ADMIN`**（後台 token）。

- 期望：立刻收到 `server:error`（`code: UNAUTHORIZED`）並斷線。
- **不可接受的結果**：連上了、或是掛著不動沒有任何回應——
  後者代表拒絕的路徑漏掉了 `disconnect`，連線會一直佔著。

再貼一次 `$FRONT_A`，確認同一支工具連得上（排除「工具本身壞了」）。

## 6. ⭐ 停權停的是前台使用者

```bash
USER_A_ID=$(curl -s http://localhost:3000/api/front/me \
  -H "Authorization: Bearer $FRONT_A" | jq -r .data.id)

# 停權（保持 ws:client 連著，觀察它是否被斷開）
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "http://localhost:3000/api/admin/moderation/members/$USER_A_ID/suspend" \
  -H "Authorization: Bearer $ADMIN"
# 期望：204，且 ws:client 收到 server:sessionRevoked 後被斷開
```

```bash
# 用管理員自己的 ID 停權 → 404（不是 409）
ADMIN_ID=$(curl -s http://localhost:3000/api/admin/me \
  -H "Authorization: Bearer $ADMIN" | jq -r .data.id)

curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "http://localhost:3000/api/admin/moderation/members/$ADMIN_ID/suspend" \
  -H "Authorization: Bearer $ADMIN"
# 期望：404——管理員的 ID 在 users 裡查不到。切換之前這裡是 409
```

解除：

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "http://localhost:3000/api/admin/moderation/members/$USER_A_ID/reinstate" \
  -H "Authorization: Bearer $ADMIN"
# 期望：204。重新登入即可再次使用——解除不會、也不該推播任何東西
```
