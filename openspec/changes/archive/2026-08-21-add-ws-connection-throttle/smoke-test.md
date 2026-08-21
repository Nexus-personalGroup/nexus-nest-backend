# add-ws-connection-throttle 手動驗證

本 change 沒有新端點，驗的是 WS 事件路徑。用內建的互動式客戶端：

```bash
pnpm --filter @app/api ws:client -- --token <accessToken> --room <roomId>
```

`.env` 先把門檻壓低，否則手打指令永遠打不到每秒 20 個事件：

```bash
WS_CONNECTION_EVENT_LIMIT=3
WS_CONNECTION_EVENT_WINDOW_SEC=10
```

## 1. ⭐ 超過門檻回錯但不斷線

在 ws:client 裡連續輸入 4 次 `ping`（10 秒內）。預期：

1. 前 3 次各印出 `pong`
2. 第 4 次印出 `error` 事件，`code: WS_RATE_LIMITED`
3. **連線仍在**——再等 10 秒後 `ping`，又會回 `pong`

第 3 點是這個 change 的取捨所在：誤判的代價不對稱，把人踢下線會讓暫時性的
異常變成使用者可見的故障，而客戶端還會自動重連造成更多負載。

## 2. ⭐ `ping` 沒有豁免

第 1 步用的就是 `ping`——它被擋下本身即是驗證。心跳看起來無害，
但「無害」是就單次而言：每秒一萬個 ping 一樣會佔滿事件迴圈。

## 3. 兩條連線各自計數

另開一個終端，用**同一個帳號**再連一條：

```bash
pnpm --filter @app/api ws:client -- --token <同一個 accessToken> --room <roomId>
```

在第一條連線上打爆（4 次 `ping`），然後在第二條打一次 `ping`。
預期第二條照常回 `pong`——計數單位是連線，不是成員。

若這裡第二條也被擋，代表計數鍵寫成了 memberId：症狀會是
「手機在用時電腦連不上」，而那種症狀不會有人聯想到限流。

## 4. 被擋下的送訊息沒有落庫

打爆額度後立刻送訊息（`send 測試`），預期收到 `WS_RATE_LIMITED`。
然後查資料庫確認沒有多出這一筆：

```sql
SELECT id, content, seq FROM chat_messages ORDER BY created_at DESC LIMIT 3;
```

guard 若接在 handler 之後才判斷，這裡會出現一筆——限流就形同虛設。

## 5. 業務層限流仍然獨立運作

把 `WS_CONNECTION_EVENT_LIMIT` 調回 20，改壓 `WS_MESSAGE_RATE_LIMIT=2`，
然後連送 3 則訊息。預期第 3 則回的是 **`CHAT_MESSAGE_RATE_LIMITED`**
而不是 `WS_RATE_LIMITED`——兩道限流各自獨立，連線層沒有把業務層蓋掉。

驗完記得把 `.env` 的三個值改回去。
