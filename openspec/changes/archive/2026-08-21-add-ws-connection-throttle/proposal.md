## Why

HTTP 端有全域 throttle middleware，但**連線建立後的每個 WebSocket 事件都是同一條
TCP 連線上的訊框，不經過任何計次**。

目前只有送訊息接了逐 use case 的限流（`add-chat-messaging`）——
`ping`、`joinRoom`、`leaveRoom`、`syncRoom` 都完全不受限。
一條已認證的連線可以用任意速率打這些事件。

這個缺口在 `add-chat-messaging` 就被寫進 `tasks/todo.md` 的「已知缺口」，
並在 `ws-rate-limit.spec.ts` 的豁免清單記下取捨。當時的判斷是
**逐個 use case 接會給出「覆蓋完整」的錯覺**——真正的防線是傳輸層的
「每條連線每秒最多 N 個事件」。這個 change 就是補上那條防線。

它是後端目前最後一個已知的安全缺口。

## What Changes

- 新增連線層的事件限流：**每條連線**每個時間窗最多 N 個事件，
  套用到**所有** `@SubscribeMessage` handler
- 超過時丟棄該事件並回 `server:error`，**不斷線**——理由見 design.md D2
- 計數在**本實例的記憶體內**，不走 Redis——理由見 design.md D1
- 閾值進 `envSchema`
- `ws-rate-limit.spec.ts` 的 `handleSyncRoom` 豁免可以移除——
  它現在被連線層涵蓋了

## Capabilities

### Modified Capabilities

- `platform-websocket-transport`：新增「連線層必須有事件限流」的需求
- `platform-engineering-guardrails`：既有的「WS 事件必須表態限流」補上
  「連線層限流不能取代寫入型的逐 use case 限流」

## Impact

- **無資料庫 migration**
- **新增兩個環境變數**（事件數上限與時間窗）
- 對正常使用**不應該有可見影響**——閾值會設在遠高於任何合理客戶端的水準
- 不改動任何 API 的行為
