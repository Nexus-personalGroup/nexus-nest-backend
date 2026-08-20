# ws-chat-message Specification

## Purpose
聊天訊息的 WebSocket 事件契約：送出訊息與 ack、訊息廣播、斷線補齊、已讀位置通知。

三個在網路不可靠時才會顯形的問題，全部在契約層面解決：

- **重送不得產生第二則**。客戶端在首次送出前產生 `clientMessageId`，重試時沿用；
  伺服器以 `(roomId, clientMessageId)` 唯一索引去重，並回傳與首次相同的 ack。
- **順序由伺服器決定**。房間內單調遞增的 `seq` 是訊息順序的唯一依據，不用時間戳
  ——兩個實例可能在同一毫秒寫入，而不同客戶端各自排序會得到不同結果。
- **斷線期間的訊息必須補得回來**。客戶端帶 `lastSeq` 補齊，回應以 `hasMore`
  明示是否還有更多；沒有這個旗標，「補齊上限」會靜默地變成「丟訊息」。

**ack 一定在寫入成功之後才送**：樂觀回覆在寫入失敗時會讓使用者看到一則實際不存在的
訊息，而且沒有回頭修正的機會。成員資格判斷與 `ws-chat-room` 共用同一份實作。

## Requirements
### Requirement: 送出訊息

`client:sendMessage` MUST 在訊息寫入成功後才回 ack，且同一個 `clientMessageId` 重送 MUST NOT 產生第二則訊息。

呼叫者 MUST 是該房間的成員；判斷沿用 `ws-chat-room` 的同一個 use case，MUST NOT 另寫一份。

`clientMessageId` 由客戶端在**首次送出前**產生，重試時沿用同一個值。伺服器撞到
`(roomId, clientMessageId)` 唯一索引時 MUST 回傳與首次成功時相同的 ack——
對呼叫端而言「重送」與「首次送出」不可區分，否則客戶端無從判斷該不該再試一次。

**ack MUST 在寫入成功之後才送出。** 樂觀回覆（先 ack 再寫）在寫入失敗時會讓使用者
看到一則實際不存在的訊息，而且沒有回頭修正的機會——客戶端已經把它畫在畫面上了。

**Payload**：

```json
{
  "roomId": "550e8400-e29b-41d4-a716-446655440000",
  "clientMessageId": "9f8e7d6c-5b4a-4321-8765-0f1e2d3c4b5a",
  "content": "午餐吃什麼"
}
```

**Ack**：伺服器回 `server:messageAck`

```json
{
  "clientMessageId": "9f8e7d6c-5b4a-4321-8765-0f1e2d3c4b5a",
  "messageId": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "seq": 42,
  "createdAt": "2026-08-20T06:00:00.000Z"
}
```

**Failure Responses**：失敗一律經 `server:error` 送出。

- `code: "CHAT_ROOM_NOT_FOUND"`：房間不存在，**或呼叫者不是成員**——兩者回同一個錯誤
- `code: "CHAT_MESSAGE_RATE_LIMITED"`：超過限流閾值
- `code: "BAD_REQUEST"`：payload 不符 schema（`content` 為空或超長、ID 非 uuid）

#### Scenario: 成員送出訊息

- **WHEN** 房間成員送出合法訊息
- **THEN** 訊息落庫、取得該房間的下一個 `seq`，呼叫者收到 ack

#### Scenario: 同一個 clientMessageId 重送

- **WHEN** 客戶端因逾時重試，送出相同的 `roomId` + `clientMessageId`
- **THEN** MUST NOT 新增第二則訊息，回傳與首次相同的 `messageId` 與 `seq`

#### Scenario: 非成員送出訊息

- **WHEN** 呼叫者不是該房間成員
- **THEN** 回 `CHAT_ROOM_NOT_FOUND`，且 MUST NOT 寫入任何資料

#### Scenario: 寫入失敗

- **WHEN** 資料庫寫入失敗
- **THEN** MUST NOT 送出 ack，也 MUST NOT 廣播——失敗的訊息不可出現在任何人的畫面上

### Requirement: 訊息廣播

`server:messageCreated` SHALL 於訊息寫入成功後送給該房間的所有成員，且 MUST 跨實例送達。

送出者自己也會收到這則廣播。**不為送出者做特殊處理**：他的 ack 與廣播帶有相同的
`messageId`，客戶端以此對應自己樂觀顯示的那則，這比「送出者走另一條路徑」少一個分支。

**Payload**：

```json
{
  "messageId": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "roomId": "550e8400-e29b-41d4-a716-446655440000",
  "senderId": "660e8400-e29b-41d4-a716-446655440001",
  "content": "午餐吃什麼",
  "seq": 42,
  "createdAt": "2026-08-20T06:00:00.000Z"
}
```

#### Scenario: 房間成員收到訊息

- **WHEN** 某成員送出訊息
- **THEN** 該房間所有已加入 socket room 的連線都收到，包含連在其他實例上的

#### Scenario: 未加入 socket room 的成員

- **WHEN** 某成員是房間成員但這條連線沒有 `client:joinRoom`
- **THEN** 這條連線收不到廣播——socket room 的加入是即時推送的前提，補齊由 `client:syncRoom` 負責

### Requirement: 斷線補齊

`client:syncRoom` SHALL 回傳該房間中 `seq` 大於客戶端 `lastSeq` 的訊息，且回應 MUST 明示是否還有更多。

WebSocket 斷線重連是常態而非異常。重連後不補齊就是靜默丟訊息——
使用者不會知道自己漏看了什麼。

單次回傳 MUST 有上限，且 MUST 帶 `hasMore` 旗標。**沒有這個旗標，「補齊上限」會靜默地
變成「丟訊息」**：客戶端會以為斷線期間只有這幾則。

補齊用 `seq` 而非時間：客戶端的時鐘不可信，而 `seq` 是伺服器產生、房間內連續的。

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

### Requirement: 已讀位置變動通知

`server:roomRead` SHALL 於某成員的已讀位置前進時，通知該房間的其他成員。

只送給其他成員：自己的已讀位置是自己更新的，回推給自己沒有資訊量。

**Payload**：

```json
{
  "roomId": "550e8400-e29b-41d4-a716-446655440000",
  "memberId": "660e8400-e29b-41d4-a716-446655440001",
  "lastReadSeq": 42
}
```

#### Scenario: 對方讀到最新

- **WHEN** 房間中某成員把已讀位置更新到最新的 `seq`
- **THEN** 其他成員收到該成員的 `lastReadSeq`，據此顯示已讀狀態

#### Scenario: 收件者連在其他實例

- **WHEN** 更新已讀的成員與收件者連在不同的 API 實例
- **THEN** 收件者仍收得到——推送經跨實例廣播

