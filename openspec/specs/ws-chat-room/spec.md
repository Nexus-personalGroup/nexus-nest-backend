# ws-chat-room Specification

## Purpose
前台聊天室的 WebSocket 事件契約：把一條連線加入／移出某個房間的 socket room，
以及房間成員變動的即時通知。

**加入房間必須先取得授權。** 連線層的認證回答的是「你是誰」，
不回答「你可以碰哪些資源」——僅憑客戶端提供的 `roomId` 就加入，
等於任何已認證使用者都能竊聽任意房間。成員資格的判斷屬於業務規則，
位於 application 層並與 REST 端共用同一份實作（`api-front-chat-room`）。

socket room 的加入／離開只影響單一連線，不改變資料庫中的成員關係；
後者由 `api-front-chat-room` 負責。

## Requirements
### Requirement: 加入房間

`client:joinRoom` MUST 先驗證呼叫者在該房間的成員關係，才可執行 socket room 的加入。

客戶端要求把這條連線加入某個房間，以接收該房間的即時事件。
MUST NOT 僅憑客戶端提供的識別碼就加入——那等於任何已認證使用者都能竊聽任意房間。

成員資格的判斷 MUST 位於 application 層，MUST NOT 寫在 gateway：
它是業務規則，不是傳輸細節。gateway 只負責在取得許可後執行 socket 操作。

**Payload**：

```json
{ "roomId": "550e8400-e29b-41d4-a716-446655440000" }
```

**Ack**：伺服器回 `server:roomJoined`

```json
{ "roomId": "550e8400-e29b-41d4-a716-446655440000" }
```

**Failure Responses**：

失敗一律經 `server:error` 送出。

- `code: "CHAT_ROOM_NOT_FOUND"`：房間不存在，**或呼叫者不是成員**——兩者回同一個錯誤，
  否則可用它探測任意房間是否存在
- `code: "BAD_REQUEST"`：payload 不符 schema（`roomId` 必須是 uuid）

#### Scenario: 成員加入自己的房間

- **WHEN** 呼叫者是該房間成員
- **THEN** 連線加入該 socket room，收到 ack

#### Scenario: 非成員嘗試加入

- **WHEN** 呼叫者不是該房間成員
- **THEN** 回 `CHAT_ROOM_NOT_FOUND`，且該連線 MUST NOT 被加入 socket room

#### Scenario: 房間不存在

- **WHEN** `roomId` 指向不存在的房間
- **THEN** 回 `CHAT_ROOM_NOT_FOUND`——與「非成員」同一個錯誤碼

### Requirement: 離開房間

`client:leaveRoom` SHALL 把這條連線移出某個房間的 socket room。
**只影響本條連線**，MUST NOT 改變 DB 中的成員關係
——那是 REST 的 `DELETE …/members/me` 負責的事。

離開不需要成員資格驗證：對一個本來就沒加入的 socket room 執行離開是無害的無操作。

**Payload**：

```json
{ "roomId": "…" }
```

**Ack**：伺服器回 `server:roomLeft`

```json
{ "roomId": "550e8400-e29b-41d4-a716-446655440000" }
```

**Failure Responses**：

失敗一律經 `server:error` 送出。

- `code: "BAD_REQUEST"`：payload 不符 schema

#### Scenario: 離開已加入的房間

- **WHEN** 連線已在該 socket room 內
- **THEN** 移出並回 ack，DB 的成員關係不變

#### Scenario: 離開未加入的房間

- **WHEN** 連線本來就不在該 socket room
- **THEN** 回 ack（無操作），不視為錯誤

### Requirement: 房間成員變動通知

`server:roomMemberChanged` SHALL 於房間成員加入或離開時通知該房間的其他成員。
推送 MUST 送達所有實例上的連線，不只是觸發變動的那個實例。

**Payload**：

```json
{
  "roomId": "…",
  "memberId": "…",
  "action": "JOINED",
  "memberCount": 3
}
```

`action` 為 `"JOINED"` 或 `"LEFT"`。

#### Scenario: 成員離開群組

- **WHEN** 某成員呼叫 REST 的離開房間
- **THEN** 該房間其餘成員收到 `action: "LEFT"` 與更新後的 `memberCount`

#### Scenario: 收件者連在其他實例

- **WHEN** 觸發變動的成員與收件者連在不同的 API 實例
- **THEN** 收件者仍收得到——推送經跨實例廣播，不受連線落在哪個行程影響

