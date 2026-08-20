# add-chat-messaging 手動驗證

> 需要本機服務已啟動（`pnpm dev`，由你自己跑）與一組 access token。
> `TOKEN` 取自 `POST /api/admin/auth/login` 的 `data.accessToken`。

```bash
export API=http://localhost:3000/api/front
export TOKEN=<accessToken>
export AUTH="Authorization: Bearer $TOKEN"
```

## 1. 準備一個房間

```bash
# 需要另一個成員的 id（後台 GET /api/admin/members 可查）
curl -s -X POST "$API/chat-rooms/group" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"煙霧測試","memberIds":["<另一個 memberId>"]}' | jq
export ROOM=<回應中的 data.id>
```

## 2. 送訊息與去重（走 WebSocket）

REST 沒有送訊息的端點——那是刻意的（見 design.md D1）。用測試客戶端：

```bash
pnpm --filter @app/api ws:client -- --token "$TOKEN" --room "$ROOM"
```

連上後依序輸入：

```
send 第一則
resend 這則會送兩次
resend 這則會送兩次
sync 0
```

預期：

- `send` → 收到 `messageAck`（含 `seq`）與 `messageCreated`
- 兩次 `resend` → **兩次 ack 的 `messageId` 與 `seq` 相同**，且第二次**不會**再收到 `messageCreated`
- `sync 0` → `roomSynced` 回傳全部訊息，`hasMore: false`

開第二個終端機連同一房間（或連到另一個 `--url` 的實例），確認訊息跨連線／跨實例收得到。

## 3. 限流

連續送超過 `WS_MESSAGE_RATE_LIMIT`（預設 20）則：

```
send 1
send 2
... （共 21 次）
```

預期：第 21 則收到 `error`，`code: CHAT_MESSAGE_RATE_LIMITED`，且該則**不會**出現在歷史中。

## 4. 歷史查詢（游標分頁）

```bash
curl -s "$API/chat-rooms/$ROOM/messages?limit=2" -H "$AUTH" | jq
# 拿回應中最舊那則的 seq 當游標
curl -s "$API/chat-rooms/$ROOM/messages?limit=2&beforeSeq=<seq>" -H "$AUTH" | jq
```

預期：由新到舊；第二次的結果**不與第一次重疊**；還有更早的訊息時 `hasMore: true`。

## 5. 已讀位置

```bash
curl -i -X PATCH "$API/chat-rooms/$ROOM/read" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"lastReadSeq":2}'
# 再送一次更小的值
curl -i -X PATCH "$API/chat-rooms/$ROOM/read" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"lastReadSeq":1}'
```

預期：兩次都回 `204`；第二次**不改變**已讀位置，也不會讓其他人收到 `roomRead`。
房間裡的另一條連線在第一次時應收到 `server:roomRead`。

## 6. 授權

用一個**不是該房間成員**的帳號重跑第 4、5 步：

預期：兩者都回 `404` + `CHAT_ROOM_NOT_FOUND`（不是 403——回 403 等於洩漏房間存在）。
WS 的 `sendMessage` / `syncRoom` 同樣回 `CHAT_ROOM_NOT_FOUND`。
