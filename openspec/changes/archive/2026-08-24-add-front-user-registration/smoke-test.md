# 手動驗證：前台註冊、信箱驗證與密碼重設

> 前置：`pnpm dev` 已啟動（**由你啟動**）、`.env` 已補上六個新變數、
> `db:migrate:deploy` 與 `db:seed` 都跑過。
>
> **這份清單的重點是自動化測試驗不到的那一段：真的收一封信。**
> e2e 是攔截 `SendEmailPort` 拿到內文的——它證明得了「程式產生了一個正確的連結」，
> 證明不了「那封信寄得出去、長得能看、而且點下去真的會動」。

## 0. 先確認 SMTP 真的通

沒有設 SMTP 的話下面第 2、3 節全部驗不到（註冊仍然會成功，只是信寄不出去——
這是刻意的行為，見 design 的 Risks）。

`.env` 需要 `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM`。
本機可以用 [Mailpit](https://github.com/axllent/mailpit) 或 MailHog 收信：

```bash
docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit
# .env: SMTP_HOST=127.0.0.1  SMTP_PORT=1025  SMTP_USER=  SMTP_PASS=
# 收件匣：http://localhost:8025
```

## 1. 註冊

```bash
curl -s -X POST http://localhost:3000/api/front/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"User1234!","displayName":"小明"}' | jq
```

- 期望 `201`，`data.emailVerified` 為 `false`
- ⚠️ **回應裡不該有任何 token**——註冊不等於登入

再打一次同樣的請求：

```bash
# 期望 409 EMAIL_ALREADY_EXISTS，**而且收件匣又多一封驗證信**
# （已註冊但未驗證 → 重發。這是使用者信被歸到垃圾信匣時的真實行為）
```

## 2. ⭐ 只有人工驗得到：真的去收那封信

打開收件匣（Mailpit 是 http://localhost:8025）。確認：

- **信寄到了**，寄件者是 `EMAIL_FROM`
- 主旨是「請驗證你的信箱」
- 內文有一個**看得到、點得下去**的連結（不是一坨 HTML 原始碼、不是 `undefined`）
- 連結指向 `http://localhost:3000/api/front/auth/verify-email?token=...`
- 文案寫著「此連結將在 24 小時後失效」

**直接在信件裡點那個連結。** 期望：

- 瀏覽器被導到 `http://localhost:5174/verify-email?result=success`
- ⚠️ **不可接受**：停在空白頁、網址列還是 `localhost:3000`、或看到一段 JSON。
  空白頁代表 `Location` header 是空的——`TransformInterceptor` 把 redirect 的
  回傳值包掉了（這個坑踩過一次，已加豁免與單元測試，但值得再確認一次）
- 前台還沒開始，所以 5174 會是「無法連線」——**那是正常的**，
  要看的是**網址列的內容**：`/verify-email?result=success`

**再點一次同一個連結**：仍然要是 `result=success`，不是 `invalid`。
（郵件安全掃描與瀏覽器預抓會提前把 token 用掉，對使用者顯示失敗是錯的。）

## 3. 驗證後可以聊天

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"User1234!"}' | jq -r .data.accessToken)

curl -s http://localhost:3000/api/front/me -H "Authorization: Bearer $TOKEN" \
  | jq '{emailVerified, emailVerifiedAt}'
# 期望：emailVerified 為 true

curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/front/chat-rooms \
  -H "Authorization: Bearer $TOKEN"
# 期望：200
```

## 4. ⭐ 未驗證的帳號：登得進來、聊不了天

seed 有一個刻意未驗證的帳號 `unverified@test.com`（密碼 `User1234!`）。

```bash
PENDING=$(curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"unverified@test.com","password":"User1234!"}' | jq -r .data.accessToken)

# 登得進來，也看得到自己
curl -s http://localhost:3000/api/front/me -H "Authorization: Bearer $PENDING" | jq .data.emailVerified
# 期望：false

# 但聊不了天
curl -s http://localhost:3000/api/front/chat-rooms -H "Authorization: Bearer $PENDING" | jq '{code}'
# 期望：EMAIL_NOT_VERIFIED（403）
```

**WS 同樣連不上**（這一條只有人工驗得到——自動化測試是簽 token 直接連）：

```bash
pnpm --filter @app/api ws:client
```

貼上 `$PENDING`。期望立刻收到 `server:error`（`code: EMAIL_NOT_VERIFIED`）並斷線。

> 只擋 HTTP 不擋 WS 的話，未驗證的帳號雖然開不了房間，
> **卻能連上去收別人的廣播**——那比「能不能發言」更嚴重。

## 5. 密碼重設

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  http://localhost:3000/api/front/auth/forgot-password \
  -H 'Content-Type: application/json' -d '{"email":"me@example.com"}'
# 期望：204
```

回收件匣拿重設信裡的 token，然後：

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  http://localhost:3000/api/front/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"<貼上>","password":"BrandNew1234!"}'
# 期望：204
```

確認三件事：

```bash
# (1) 新密碼可以登入
curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"BrandNew1234!"}' | jq -r .success

# (2) ⭐ 第 3 節拿到的舊 token 已經失效
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/front/me \
  -H "Authorization: Bearer $TOKEN"
# 期望：401——會走到「忘記密碼」的情境本來就包含「帳號可能正被別人用著」

# (3) 同一個重設 token 不能再用一次
# 期望：400 INVALID_TOKEN
```

## 6. ⭐ 不洩漏帳號是否存在

對一個**從未註冊過**的信箱打這兩支，回應必須與存在的帳號**完全一樣**：

```bash
for EMAIL in me@example.com never-registered@example.com; do
  echo -n "$EMAIL forgot: "
  curl -s -o /dev/null -w '%{http_code}' -X POST \
    http://localhost:3000/api/front/auth/forgot-password \
    -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}"
  echo -n "  resend: "
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    http://localhost:3000/api/front/auth/resend-verification \
    -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}"
done
# 期望：四個都是 204
```

⚠️ 順便**留意回應的耗時**：兩者差距不該明顯（寄信是 fire-and-forget，
就是為了讓「帳號存在」不會因為 SMTP 往返而慢上兩個數量級——
那是比狀態碼更明顯的列舉訊號）。

**註冊那一支例外**：它會回 409 告訴你信箱已存在，那是刻意的（見 design D3）。

## 7. 限流

```bash
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "$i: %{http_code}\n" -X POST \
    http://localhost:3000/api/front/auth/resend-verification \
    -H 'Content-Type: application/json' -d '{"email":"me@example.com"}'
done
# 期望：前 3 次 204，之後 429（EMAIL_SEND_RATE_LIMIT 預設 3 / 15 分鐘）
```

大小寫換一下再打一次，**應該共用同一份額度**（仍是 429）：

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  http://localhost:3000/api/front/auth/resend-verification \
  -H 'Content-Type: application/json' -d '{"email":"ME@EXAMPLE.COM"}'
```
