# ws-chat-moderation Specification

## Purpose
管理員移除與還原訊息的即時推播契約。

移除與還原本身走 REST（見 `api-moderation`）；這裡只定義**變更發生後**
如何讓所有人的畫面同步。

**與 `ws-chat-retraction` 是不同的事件，刻意不共用**：
「對方自己收回」與「被平台處理」對使用者是兩件事，共用會讓發送者以為自己撤回了。
兩個獨立事件也讓客戶端不必在每個 handler 裡先分支——而它們的 payload 確實不同：
移除帶 `removedAt`，還原帶「還原後的撤回狀態」（可能仍是已收回）。

推播 MUST NOT 包含內容——那正是移除要達成的事。
`seq` 位置保留，客戶端顯示「因違反規範被移除」而非把它從畫面移除：
移除的訊息從結果中消失會與「漏收一則」難以區分。

## Requirements
### Requirement: 訊息移除通知

`server:messageRemoved` SHALL 於管理員移除訊息時通知該房間的所有成員，且 MUST 跨實例送達。

推播 MUST NOT 包含被移除的內容——那正是移除要達成的事。
客戶端據此把該則顯示為「因違反規範被移除」，`seq` 位置保留。

**與 `server:messageRetracted` 是不同的事件**，不共用：兩者對使用者的語意不同
（「對方自己收回」vs「被平台處理」），共用會讓發送者以為自己撤回了。

**Payload**：

```json
{
  "messageId": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "roomId": "550e8400-e29b-41d4-a716-446655440000",
  "seq": 42,
  "removedAt": "2026-08-21T06:00:00.000Z"
}
```

#### Scenario: 房間成員收到移除通知

- **WHEN** 管理員移除某則訊息
- **THEN** 該房間所有已加入 socket room 的連線都收到，包含連在其他實例上的

#### Scenario: 推播不含內容

- **WHEN** 移除通知送出
- **THEN** payload 中 MUST NOT 出現 `content`

#### Scenario: 重複移除

- **WHEN** 對已移除的訊息再次執行移除
- **THEN** MUST NOT 重複推播——沒有東西改變

### Requirement: 訊息還原通知

`server:messageRestored` SHALL 於管理員還原被誤移除的訊息時通知該房間的所有成員。

還原 MUST NOT 影響使用者自己的撤回狀態：若該則原本已被發送者撤回，
還原後它應回到「已收回」而非完全正常。因此 payload MUST 帶還原後的撤回狀態，
讓客戶端知道要顯示哪一種。

**Payload**：

```json
{
  "messageId": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "roomId": "550e8400-e29b-41d4-a716-446655440000",
  "seq": 42,
  "retractedAt": null
}
```

`retractedAt` 有值代表該則仍是「已收回」狀態。

#### Scenario: 還原未被撤回的訊息

- **WHEN** 管理員還原一則只被移除過的訊息
- **THEN** 房間成員收到通知且 `retractedAt` 為 null，客戶端恢復正常顯示

#### Scenario: 還原曾被撤回的訊息

- **WHEN** 該則原本已被發送者撤回，之後被移除，現在被還原
- **THEN** `retractedAt` 有值——客戶端顯示「訊息已收回」，不是完全正常

#### Scenario: 還原未被移除的訊息

- **WHEN** 對未被移除的訊息執行還原
- **THEN** MUST NOT 推播——沒有東西改變

