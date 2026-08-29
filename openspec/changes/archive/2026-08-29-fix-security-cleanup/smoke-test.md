# Smoke Test — fix-security-cleanup

五塊裡有三塊自動化驗得完（效期、fail-open 痕跡、心跳）。
**CSP 那塊驗不完**：e2e 只驗得到 header 存在，驗不到「頁面還能不能用」。
第 1 節是這個 change 唯一非做不可的人工項。

前置：`pnpm docker:deps` + `pnpm dev`。

---

## 1. ⭐ CSP 上線後後台還能不能用（只有人工驗得到）

**這是本 change 最可能出事的地方。** 先前 CSP 是全域關閉的，
所以後台 SPA 從來沒有在 CSP 之下跑過——被擋的資源不會有錯誤回應，
只會在瀏覽器 console 出現 `Refused to load ...`，而畫面看起來像是「某塊沒渲染」。

單一埠部署模式（本 change 真正要保護的那個模式）：

```bash
# 先 build 前端，讓 API 以同一個埠吐 SPA
pnpm --filter @app/web build
WEB_STATIC_ROOT=apps/web/dist pnpm --filter @app/api start
```

開 `http://localhost:3000`，**打開瀏覽器 devtools 的 Console**，走一輪：

1. 登入
2. 帳號列表 → 翻頁 → 篩選
3. 開一個編輯 Modal → 存檔
4. 角色管理 → 編輯權限
5. 登出

**期望**：Console **沒有任何 `Content-Security-Policy` / `Refused to` 訊息**，
每一頁的樣式與互動都正常。

**若有被擋的資源**：把該來源加進 `security-headers.ts` 的 directives，
**不要改回全域關閉**——那會把整個問題退回原點。

## 2. Swagger UI 仍然打得開

```bash
open http://localhost:3000/api/admin/docs
open http://localhost:3000/api/front/docs
```

**兩條都要開**。e2e 驗的是中介層的分支（測試 app 不掛 Swagger 路由），
「UI 真的渲染得出來」只有這裡看得到。

期望：兩份文件都正常渲染、可以展開端點、Try it out 能送出。

```bash
# 文件路徑沒有 CSP、一般路徑有
curl -sI http://localhost:3000/api/admin/docs | grep -i content-security-policy   # 期望：無輸出
curl -sI http://localhost:3000/api/health    | grep -i content-security-policy    # 期望：有一行
```

## 3. refresh 效期

```bash
curl -s -X POST http://localhost:3000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"YourPass123!"}' | jq '.data.refreshTokenExpiresIn'
# 期望：86400（.env 沒有顯式設定的話）
```

`.env` 若顯式設過 604800，這裡會是 604800——**那要手動改**（見下方「需要你做的」）。

## 4. Redis 掛掉時的痕跡

```bash
docker compose stop redis

# 連續打三次錯密碼
for i in 1 2 3; do
  curl -s -o /dev/null -X POST http://localhost:3000/api/admin/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@example.com","password":"wrong"}'
done
```

**期望**：`pnpm dev` 的輸出出現警告
「Redis 不可用，登入失敗計數未生效」與「IP 失敗計數未生效」**兩則**。
登入仍然正常回 401（放行是刻意的，不是 bug）。

```bash
# 指標（APPLICATION_METRICS_ENABLED=true 時）
curl -s http://localhost:3000/api/metrics | grep security_guard_degraded_total
# 期望：account-lock 與 ip-block 兩個標籤都有值
docker compose start redis
```

## 5. 心跳

連上 WS（前台專案或任一 socket.io 客戶端），掛著兩分鐘：

```bash
curl -s http://localhost:3000/api/metrics | grep chat_ws_heartbeat
# 期望：chat_ws_heartbeat_seconds 有觀測值且遠小於 15；
#       chat_ws_heartbeat_skipped_total 為 0
```

`skipped_total` 持續增加代表續期已經跟不上——那是該擴實例或調參的訊號，
不是這個 change 沒做好。

---

## 需要你做的

1. **改 `apps/api/.env`**：`REFRESH_TOKEN_EXPIRES_IN=86400`
   （改預設值不影響已顯式設定的環境）。改完既有 session 一天後要重新登入。
2. **CSP 上線後看一輪 Console**（第 1 節）。這是唯一沒有自動化替身的項目。
