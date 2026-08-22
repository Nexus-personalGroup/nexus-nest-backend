# fix-unauthenticated-surface 手動驗證

前置：`.env` 加上 `APPLICATION_ACCOUNT_LOCK_ENABLED=true`（**預設是 false**，
不開的話整個鎖定機制不會啟動，第 1 項驗不到），並把時效壓短方便測：

```bash
APPLICATION_ACCOUNT_LOCK_ENABLED=true
APPLICATION_ACCOUNT_LOCK_DURATION_MIN=1
```

## 1. ⭐ 鎖定會自己解除，不需要任何人介入

**這是這個 change 的核心，也是 CI 驗不到的部分。**

用測試帳號打三次錯密碼（`APPLICATION_ACCOUNT_LOCK_THRESHOLD` 預設 3）：

```bash
for i in 1 2 3; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/admin/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@test.com","password":"錯的"}'
done
```

第四次用**正確**密碼，預期 **423**（不是 403 —— 改動前丟的是 `ForbiddenException`）：

```bash
curl -i -X POST http://localhost:3000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"Admin1234!"}'
```

回應應含 `"code":"ACCOUNT_LOCKED"` 與「請稍後再試」（不再是「請聯繫管理員解鎖」）。

**等 70 秒**，再用正確密碼登入 —— **應該直接成功**。
改動前這裡是死結：鎖定永不到期，而解鎖端點需要一個已登入的 SUPERADMIN。

## 2. ⭐ 到期後再打錯一次，不會立刻重新鎖定

**這是最容易漏掉的一步。**

接續第 1 項，等時效過後**不要**直接登入成功，而是先打錯一次，再用正確密碼登入。

預期：**登入成功**。若立刻又回 423，代表到期時沒有清掉失敗計數 ——
Redis 計數的 TTL 是 30 分鐘，比時效長，計數還停在 3，下一次失敗就會重新觸發鎖定。
症狀是「實際鎖定時間變成 30 分鐘」，而 `.env` 裡那個 1 看起來完全正常。

## 3. Swagger 開關

```bash
# 預設（NODE_ENV=development）→ 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/admin/docs-json

# 明確關閉後重啟服務 → 404
SWAGGER_ENABLED=false pnpm dev
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/admin/docs
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/admin/docs-json
```

**兩條都要是 404。** 只關 UI 是最容易犯的錯 —— `docs-json` 才是有價值的那份
（完整結構、可直接餵給工具），而它沒有介面所以不顯眼。

模擬 production 的預設行為（不設 `SWAGGER_ENABLED`）：

```bash
NODE_ENV=production ... pnpm --filter @app/api start   # 其餘 production 必填變數要補齊
```

## 4. `/api/metrics` 的豁免範圍

需要 `APPLICATION_METRICS_ENABLED=true`。

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/metrics        # 200
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/api/metrics?x=1'  # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/metrics-secret # 401
```

第三條是重點：改動前用 `startsWith`，**任何 `/api/metrics` 開頭的新路由都會自動免認證**，
而那不會有任何錯誤訊息提醒你。

## 5. `DB_PORT` 預設值

不需要跑 —— e2e 與 integration 都連真實資料庫，已經涵蓋。
只需確認一件事：**你的 `.env` 有明確設 `DB_PORT=5442`**，
所以預設值從 3306 改成 5432 對本機沒有任何影響。

驗完記得把第 1 項加的兩行從 `.env` 拿掉（或把時效改回 15）。
