## Why

送錯訊息是聊天最常見的操作失誤，而目前送出去就收不回來。

這件事的設計約束在 `add-chat-messaging` 就已經定下來了：**撤回必須是軟刪除**。
訊息那一列刪掉會讓 `seq` 出現洞，而補齊的客戶端無法區分「這個號碼被撤回了」與
「我漏收了」——後者會讓客戶端反覆嘗試補齊同一段區間。所以這個 change 不是在
決定「要不要軟刪除」，而是把當時記在 design.md 的約束實作出來。

真正要在這裡決定的是另外兩件事，兩者都有明確的取捨：

- **撤回有時限**。撤回的用途是「剛剛傳錯了」，不是「抹除歷史」。不設時限等於讓
  對話紀錄隨時可被單方面改寫，而對方早已讀過。
- **內容保留在資料庫，但一律不外流**。M3 的檢舉調查需要看到被撤回的訊息——
  騷擾者送完馬上撤回是最典型的行為，清掉內容等於提供一鍵銷毀證據。
  代價要認：使用者以為刪掉了，實際還在。

## What Changes

- `ChatMessageRecord` 新增 `retractedAt`（可空）與 `retractedBy`
- **撤回走 REST**（`DELETE /api/front/chat-rooms/:roomId/messages/:messageId`），不走 WebSocket——理由見 design.md D1
- 只有**發送者本人**可以撤回自己的訊息，且必須在時限內
- 撤回後 `seq` 保留；歷史查詢與斷線補齊照常回傳該則，但**不含內容**
- 新增 `server:messageRetracted` 推播，讓所有人的畫面同步
- 新增守則：訊息的持久層存取只能有一個入口——內容遮蔽發生在那裡，多一個入口就多一條洩漏路徑

## Capabilities

### New Capabilities

- `ws-chat-retraction`：撤回的即時推播契約

### Modified Capabilities

- `api-front-chat-message`：新增撤回端點；歷史查詢的回應加上撤回狀態
- `ws-chat-message`：斷線補齊的回應加上撤回狀態
- `platform-engineering-guardrails`：新增「訊息持久層單一入口」守則

## Impact

- **資料庫 migration**：`chat_messages` 加兩個可空欄位，既有列為 null（未撤回），不需資料遷移
- **回應格式變更**：訊息物件新增 `retractedAt` 欄位，且 `content` 在撤回時為空字串。
  這是**對既有客戶端的相容性變更**——前台是獨立 repo，需同步調整
- **新增環境變數**：撤回時限（進 `envSchema`）
- 不改動送訊息、去重、配號的任何行為
