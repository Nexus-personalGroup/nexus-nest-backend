# Smoke Test — fix-front-registration-gaps

四塊裡三塊自動化驗得完。**第 1 節驗不完**——那正是這個 change 存在的原因：
整個測試矩陣沒有任何一個測試檢查「送到系統外面去的字串」，
而 3b 的 smoke-test **寫了正確答案卻沒有被執行**。

前置：`pnpm docker:deps` + `pnpm dev`。

---

## 1. ⭐ 驗證信裡那個連結（唯一非做不可的人工項）

現在有一支單元測試直接斷言連結字串了，但**沒有人真的寄過一封信出來看**。
這一步就是去看。

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/front/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.com","password":"User1234!","displayName":"煙霧測試"}'
# 期望：201
```

到你的 SMTP 收件匣（或 `pnpm dev` 的 log，寄信失敗時會印出來）把信打開，
**把連結複製出來**：

```
期望：http://localhost:3000/api/front/auth/verify-email?token=...
               ^^^^^^^^^^^^^^ port 3000（API）

修好之前是：http://localhost:5174/api/front/auth/verify-email?token=...
                    ^^^^^^^^^^^^^^ port 5174（前台網站，那個路徑不存在）
```

**直接點它**，應該 302 導到 `http://localhost:5174/verify-email?result=success`。
前台還沒開始，所以那一頁會 404——**那是預期的**，
要確認的是**導向目標對不對**，不是頁面存不存在。

```bash
# 驗完之後該帳號可以聊天了
curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.com","password":"User1234!"}' | jq '.data.user.emailVerified'
# 期望：true
```

## 2. 重設密碼會標記已驗證

```bash
# 開一個新帳號，但**不要**去點驗證信
curl -s -o /dev/null -X POST http://localhost:3000/api/front/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"unverified@example.com","password":"User1234!","displayName":"未驗證"}'

# 走忘記密碼，從信裡取出 token
curl -s -o /dev/null -X POST http://localhost:3000/api/front/auth/forgot-password \
  -H 'Content-Type: application/json' -d '{"email":"unverified@example.com"}'

curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/front/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RESET_TOKEN\",\"password\":\"NewPass1234!\"}"
# 期望：204

curl -s -X POST http://localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"unverified@example.com","password":"NewPass1234!"}' | jq '.data.user.emailVerified'
# 期望：true —— 從來沒點過驗證信，但重設密碼證明了同一件事
```

**修好之前這裡是 `false`**，而那個帳號會卡在一個自己解不開的死結：
密碼改好了、能登入了，但聊天被擋、WS 被拒，且沒有任何提示告訴他要去點另一封信。

## 3. 節流

```bash
for i in $(seq 1 8); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST http://localhost:3000/api/front/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"smoke@example.com","password":"wrong"}'
done; echo
# 期望：401 401 401 401 401 429 429 429（第 6 次起被擋）
```

需要真 Redis（`pnpm docker:deps` 會起）。全域是 100／分鐘，
所以**看到 429 就證明是端點層的額度在作用**。

## 4. IP 失敗計數

```bash
# APPLICATION_IP_BLACKLIST_ENABLED 要開，門檻預設 5
docker compose exec redis redis-cli --scan --pattern 'nest:failed-ip:*'
# 期望：看得到你的 IP，值隨失敗次數增加
```

達門檻後該 IP 會進黑名單，後續請求被 `IpBlacklistGuard` 擋下。
**要清掉**：`docker compose exec redis redis-cli DEL 'nest:failed-ip:<你的IP>'`，
黑名單那筆在 DB 的 `ip_blacklist` 表。

---

## 需要你做的

**production 部署前必須設 `API_BASE_URL`**——未設會**啟動失敗**（刻意的，
與 `APP_FRONT_URL` 同一個判準：啟動失敗是可見的，連結壞掉不是）。
本機不用動，預設值就是 `http://localhost:3000`。
