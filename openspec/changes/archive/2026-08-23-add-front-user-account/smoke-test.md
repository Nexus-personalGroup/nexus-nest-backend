# add-front-user-account 手動驗證

前置：`pnpm --filter @app/api db:seed` 建出前台測試帳號，`pnpm dev`。

種子帳號：`user1@test.com` / `user2@test.com` / `suspended@test.com`，密碼都是 `User1234!`。

## 1. 前台登入

```bash
curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user1@test.com","password":"User1234!"}' | jq
```

預期回 `accessToken` / `refreshToken` 與 `user` 摘要（含 `displayName`，**不含 tokenVersion**）。

把 access token 的 payload 解出來看（第二段 base64），應該有 `"side":"front"`。

## 2. ⭐ 兩側的 token 互不相通

**這是這個 change 的核心，也是最值得人工確認的一項。**

先拿一枚後台 token：

```bash
ADMIN=$(curl -s -X POST http://localhost:3000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"Admin1234!"}' | jq -r .data.accessToken)
```

用它打前台的 `/me`，**預期 401**：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/front/me \
  -H "Authorization: Bearer $ADMIN"
```

反過來，用前台 token 打後台的任一端點（例如 `/api/admin/members`），**預期 401**。

**打開後台的 Swagger（`/api/admin/docs`）隨便挑一支端點，用前台 token 打一次** ——
確認拿到的是 401 而不是任何資料。這一項要人工做，因為它驗的是
「整個後台表面對前台 token 是關著的」，而自動化測試只能抽樣。

## 3. 停權的帳號

```bash
curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"suspended@test.com","password":"User1234!"}' | jq
```

預期 `403` + `ACCOUNT_DISABLED`。

順帶驗一件事：用**錯的密碼**打同一個停權帳號，預期是 `401` 而不是 `403`——
狀態檢查排在密碼比對之後，否則「這個帳號被停權了」會變成不需要密碼就問得出來的事實。

## 4. 連續失敗不會鎖定

用錯密碼連打 5 次 `user1@test.com`，第 6 次用正確密碼，**預期直接登入成功**。

後台那套 `failedLoginCount` + `lockedAt` 剛在 `fix-unauthenticated-surface` 被證明是
未認證者可觸發的 DoS 面，前台刻意不複製——防護交給全域 throttle 與 IP 封鎖。

## 5. 登出是冪等的

```bash
# 用一個亂寫的 token 登出，預期仍是 204
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/front/auth/logout \
  -H 'Authorization: Bearer not-a-real-token'
```

要求「先通過認證才能登出」會讓 token 過期的客戶端陷入「登不出去」的狀態。

正常登出之後，用同一枚 access token 打 `/api/front/me`，預期 `401`。

## 6. 既有的前台聊天端點仍吃後台 token

**這是本 change 刻意保留的半套狀態**，驗一下確認沒有誤切：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/front/chat-rooms \
  -H "Authorization: Bearer $ADMIN"
```

預期 `200`（或該端點的正常回應），**不是 401**。
切換到前台帳號是 `migrate-chat-to-front-users` 的事——那一步一旦開始就不能留半套。
