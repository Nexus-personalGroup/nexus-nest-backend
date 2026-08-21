# ws-chat-retraction Specification

## Purpose
訊息撤回的即時推播契約。

撤回本身走 REST（見 `api-front-chat-message`）；這裡只定義**變更發生後**
如何讓所有人的畫面同步。

推播 MUST NOT 包含被撤回的內容——那正是撤回要移除的東西。
客戶端收到後把該則改為「訊息已收回」，`seq` 位置保留：
把它從畫面移除會與「漏收一則」難以區分。

## Requirements
### Requirement: 訊息撤回通知

`server:messageRetracted` SHALL 於訊息被撤回時通知該房間的所有成員，且 MUST 跨實例送達。

推播 MUST NOT 包含被撤回的內容——那正是撤回要移除的東西。
客戶端據此把該則改為「訊息已收回」，`seq` 位置保留。

**Payload**：

```json
{
  "messageId": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "roomId": "550e8400-e29b-41d4-a716-446655440000",
  "seq": 42,
  "retractedAt": "2026-08-21T06:00:00.000Z"
}
```

#### Scenario: 房間成員收到撤回通知

- **WHEN** 某成員撤回自己的訊息
- **THEN** 該房間所有已加入 socket room 的連線都收到，包含連在其他實例上的

#### Scenario: 推播不含內容

- **WHEN** 撤回通知送出
- **THEN** payload 中 MUST NOT 出現 `content`

#### Scenario: 撤回失敗時不推播

- **WHEN** 撤回因逾時或非本人而被拒絕
- **THEN** MUST NOT 送出任何通知——沒有東西改變

