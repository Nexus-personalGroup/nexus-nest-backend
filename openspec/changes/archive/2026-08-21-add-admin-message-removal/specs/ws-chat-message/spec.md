## MODIFIED Requirements

### Requirement: 斷線補齊

`client:syncRoom` SHALL 回傳該房間中 `seq` 大於客戶端 `lastSeq` 的訊息，且回應 MUST 明示是否還有更多。

WebSocket 斷線重連是常態而非異常。重連後不補齊就是靜默丟訊息——
使用者不會知道自己漏看了什麼。

單次回傳 MUST 有上限，且 MUST 帶 `hasMore` 旗標。**沒有這個旗標，「補齊上限」會靜默地
變成「丟訊息」**：客戶端會以為斷線期間只有這幾則。

補齊用 `seq` 而非時間：客戶端的時鐘不可信，而 `seq` 是伺服器產生、房間內連續的。

**已撤回或已被移除的訊息 MUST 仍出現在補齊結果中**，`content` 為空字串，
並分別帶 `retractedAt` 與 `removedAt`。把它濾掉會讓 `seq` 出現洞，
而客戶端無法區分「這個號碼被處理過了」與「我漏收了」——
後者會讓它反覆嘗試補齊同一段區間。

**Payload**：

```json
{
  "roomId": "550e8400-e29b-41d4-a716-446655440000",
  "lastSeq": 40
}
```

**Ack**：伺服器回 `server:roomSynced`

```json
{
  "roomId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    {
      "messageId": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      "senderId": "660e8400-e29b-41d4-a716-446655440001",
      "content": "午餐吃什麼",
      "seq": 41,
      "retractedAt": null,
      "removedAt": null,
      "createdAt": "2026-08-20T06:00:00.000Z"
    }
  ],
  "hasMore": false
}
```

**Failure Responses**：失敗一律經 `server:error` 送出。

- `code: "CHAT_ROOM_NOT_FOUND"`：房間不存在，或呼叫者不是成員
- `code: "BAD_REQUEST"`：payload 不符 schema

#### Scenario: 斷線期間有新訊息

- **WHEN** 客戶端帶 `lastSeq: 40`，房間目前 `lastSeq` 為 45
- **THEN** 回傳 seq 41–45 的訊息，`hasMore: false`

#### Scenario: 斷線期間的訊息超過單次上限

- **WHEN** 待補訊息數超過單次回傳上限
- **THEN** 回傳上限筆數且 `hasMore: true`——客戶端據此再次補齊或改查歷史

#### Scenario: 沒有漏接

- **WHEN** 客戶端的 `lastSeq` 已是房間最新
- **THEN** 回傳空陣列與 `hasMore: false`，不視為錯誤

#### Scenario: 斷線期間有訊息被撤回

- **WHEN** 待補區間內某則已被撤回
- **THEN** 該則仍在結果中、`seq` 連續，`content` 為空字串且 `retractedAt` 有值

#### Scenario: 斷線期間有訊息被管理員移除

- **WHEN** 待補區間內某則已被移除
- **THEN** 該則仍在結果中、`seq` 連續，`content` 為空字串且 `removedAt` 有值
