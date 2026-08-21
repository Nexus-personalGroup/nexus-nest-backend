# add-message-retraction 手動驗證

> 需要本機服務已啟動（`pnpm dev`，由你自己跑）與一組 access token。

```bash
export API=http://localhost:3000/api/front
export TOKEN=<accessToken>
export AUTH="Authorization: Bearer $TOKEN"
export ROOM=<你是成員的 roomId>
```

## 1. 送一則訊息並撤回

```bash
pnpm --filter @app/api ws:client -- --token "$TOKEN" --room "$ROOM" --api http://localhost:3000
```

輸入：

```
send 這則等一下會撤回
```

從 `messageAck` 取得 `messageId`，然後：

```
retract <messageId>
```

預期：回 `HTTP 204`，且**所有連在該房間的連線**都收到 `messageRetracted`
（payload 只有 `messageId` / `roomId` / `retractedAt`，**不含 content**）。

## 2. ⭐ 三條讀取路徑都看不到內容

這是本 change 最容易出錯的地方——遮蔽漏掉任何一條就是內容洩漏，而且不會有徵兆。
**三條都要看過**：

**(a) 歷史查詢**

```bash
curl -s "$API/chat-rooms/$ROOM/messages" -H "$AUTH" | jq '.data.list[] | {seq, content, retractedAt}'
```

預期：被撤回的那則**仍在列表中**、`seq` 連續、`content` 為 `""`、`retractedAt` 有值。

**(b) 斷線補齊**

在 ws:client 輸入 `sync 0`，檢查 `roomSynced` 的內容。

預期：同上——該則仍在、`content` 為空。**不可以被濾掉**（濾掉會讓 seq 有洞）。

**(c) 即時廣播**

再送一則新訊息，確認 `messageCreated` 正常帶內容（新訊息不可能已撤回，這條是回歸檢查）。

**(d) 資料庫裡內容還在**（這是刻意的）

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db \
  -c "SELECT seq, content, retracted_at FROM chat_messages ORDER BY seq;"
```

預期：`content` **原封不動**，`retracted_at` 有值。內容保留是為了 M3 的檢舉調查。

## 3. 授權與時限

```bash
# 撤回別人的訊息
curl -i -X DELETE "$API/chat-rooms/$ROOM/messages/<別人發的 messageId>" -H "$AUTH"
# 撤回不存在的訊息
curl -i -X DELETE "$API/chat-rooms/$ROOM/messages/00000000-0000-4000-8000-0000000000ff" -H "$AUTH"
```

預期：兩者都是 `404` + `CHAT_MESSAGE_NOT_FOUND`（**同一個錯誤碼**，否則可用它探測訊息是否存在）。

逾時要驗的話，把 `CHAT_RETRACT_WINDOW_SEC` 設成 `1`、重啟後送一則、等兩秒再撤回：

預期：`403` + `CHAT_MESSAGE_RETRACT_EXPIRED`（**不與上面共用錯誤碼**——
能走到這裡代表訊息確實是自己發的，沒有洩漏疑慮，分開才給得出可行動的提示）。

## 4. 冪等

對同一則連續撤回兩次。

預期：兩次都回 `204`，且第二次**不會**再推播 `messageRetracted`；
資料庫中的 `retracted_at` 維持第一次的時間，不被覆寫。
