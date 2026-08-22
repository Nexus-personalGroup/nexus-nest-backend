# fix-presence-scan-cost 手動驗證

前置：`pnpm dev`（或 `pnpm docker:up`），用有 `BACKEND:MODERATION:VIEW` 的帳號登入後台，
另備一個能連 WS 的前台 token（`pnpm --filter @app/api ws:client` 即可）。

## 1. ⭐ 計數單位是「人」不是「連線」

**這一項 CI 驗不到（自動化測試裡沒有真的瀏覽器）。**

開儀表板 `/moderation/dashboard`，記下「線上人數」。然後用**同一個帳號**開兩條 WS 連線：

```bash
pnpm --filter @app/api ws:client -- --token <同一個 accessToken> --room <roomId>
# 另一個終端再開一次，用同一個 token
```

預期：線上人數 **+1，不是 +2**。一個人開三個分頁仍然是一個人。

關掉其中一條，人數**不變**；兩條都關掉才 -1。

## 2. 成本：查詢在線人數不再掃 keyspace

儀表板開著（每 5 秒推一次），用 Redis 的 `MONITOR` 看實際指令：

```bash
docker exec -it nexus-nest-backend-redis-1 redis-cli MONITOR | grep -iE 'scan|scard|hgetall'
```

預期：每個推送週期只看到 **一次 `SCARD`**，**沒有 `SCAN`**、
**沒有一連串 `HGETALL`**。

改動前這裡會是「一次 SCAN + N 次 HGETALL」，N = 在線人數——
而它每 5 秒跑一次、每個 API 實例各跑一次。

`SCAN` 仍然會出現，但只在 sweep 的週期（預設 15 秒一次，`WS_HEARTBEAT_INTERVAL`），
而且它不在請求路徑上。

## 3. ⭐ 漂移會被修正（模擬實例被強制終止）

**這一項最值得手動走一次**，因為它模擬的是自動化測試裡很難重現的狀況。

連上一條 WS，確認人數是 1。然後**直接砍掉 API 行程**（`kill -9`，不要 `Ctrl-C`——
後者會走正常關閉流程並清理連線）：

```bash
kill -9 $(pgrep -f 'node --watch.*dist/main')
```

重新啟動服務。剛啟動時線上人數可能仍是 1（索引裡的殘留還在），
**等一個 sweep 週期（15 秒）後應該回到 0**。

若一直停在 1 不動，代表 sweep 的校正沒有生效——那個數字會單向累積，
而且沒有任何症狀：它只是一個越來越大、越來越不可信的數字。

## 4. 部署後的第一個 sweep 週期

索引一開始是空的（本 change 之前不存在這個 key）。所以**部署後的前 15 秒**，
線上人數會顯示 0 或偏低，第一次 sweep 之後才正確。

這是預期行為，不是 bug。要確認的是：**15 秒後它有回到正確值**。
