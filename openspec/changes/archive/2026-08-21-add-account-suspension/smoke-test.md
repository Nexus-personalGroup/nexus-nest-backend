# add-account-suspension 手動驗證

```bash
export ADMIN=http://localhost:3000/api/admin
export AUTH="Authorization: Bearer <有 BACKEND:MODERATION:EDIT 的 token>"
export TARGET=<要停權的 memberId>
```

## 1. ⭐ 停權會踢掉既有連線（本 change 的核心）

先用**被停權者的 token** 開一條 WS 連線並掛著：

```bash
pnpm --filter @app/api ws:client -- --token <target 的 accessToken> --room <roomId>
```

確認它連上、能送訊息（`send 測試`）。然後停權：

```bash
curl -i -X POST "$ADMIN/moderation/members/$TARGET/suspend" -H "$AUTH"
```

預期 ws:client 那邊：

1. **先**印出 `sessionRevoked` 事件（`reason: ACCOUNT_DISABLED`）
2. **再**斷線

順序很重要——斷線後就沒有管道可以說明原因了，而 Socket.IO 客戶端預設會自動重連。
沒有那個事件，被停權者會進入無盡的重連迴圈，看到的是「一直在連線中」。

**斷線後再輸入 `send`**：訊息不該送達（連線已斷）。

## 2. 跨實例

開兩個 API（`PORT=3000` 與 `PORT=3001`），把 ws:client 連到 **3001**，
再從 **3000** 呼叫停權。預期一樣被踢掉——`disconnectSockets()` 是 adapter 感知的。

## 3. 兩個入口效果相同

```bash
# 審閱側
curl -i -X POST "$ADMIN/moderation/members/$TARGET/suspend" -H "$AUTH"

# 帳號管理側（需 BACKEND:ACCOUNT:EDIT）
curl -i -X PATCH "$ADMIN/members/$TARGET" -H "$ACCOUNT_AUTH" \
  -H 'Content-Type: application/json' -d '{"status":false}'
```

兩者都會：帳號停用、清快取、**斷開既有連線**、寫一筆 `MEMBER_SUSPENDED` 稽核。
差別只在授權來源。

## 4. 冪等

對已停用的帳號再停權一次 → `204`，且**不重複寫稽核**：

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db \
  -c "SELECT action, member_id, target_member_id FROM chat_audit_logs ORDER BY created_at;"
```

## 5. 解除

```bash
curl -i -X POST "$ADMIN/moderation/members/$TARGET/reinstate" -H "$AUTH"
```

預期：`204`、帳號恢復、寫一筆 `MEMBER_REINSTATED`。
**不會有任何推播**——他的連線已經斷了，沒有管道可以通知。使用者重新登入即可。

## 6. 權限與保護

- 只有 `BACKEND:MODERATION:VIEW` 的帳號執行停權 → `403`
- 停權自己 → `409`（沿用帳號管理既有的 `CannotDisableSelfException`）
