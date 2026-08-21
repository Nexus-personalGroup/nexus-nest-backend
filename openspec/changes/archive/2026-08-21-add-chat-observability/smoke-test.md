# add-chat-observability 手動驗證

> 需要本機服務已啟動（`pnpm dev`，由你自己跑）。
> 指標需要 `APPLICATION_METRICS_ENABLED=true`；稽核預設開啟。

## 1. 指標端點

```bash
curl -s http://localhost:3000/api/metrics | grep '^chat_'
```

預期看到五個自訂指標（**即使流量為零也該出現**——只有 `# HELP` / `# TYPE`
而沒有指標名稱，儀表板會顯示「沒有這個指標」而不是「值為零」）：

```
chat_messages_total
chat_message_write_seconds_bucket
chat_rate_limited_total
chat_ws_events_total
chat_ws_connections
```

**確認標籤沒有房間 ID**：

```bash
curl -s http://localhost:3000/api/metrics | grep 'chat_' | grep -i 'room_id\|roomid'
```

預期：**沒有輸出**。房間數無界，標籤基數爆炸是監控系統最典型的自傷方式。

## 2. 連線數 gauge

開一個 ws:client 連線，等一個心跳週期（`WS_HEARTBEAT_INTERVAL`，預設 15 秒）後：

```bash
curl -s http://localhost:3000/api/metrics | grep chat_ws_connections
```

預期：數值等於本實例目前的連線數。斷線後再等一個週期會回到 0。

## 3. 行為稽核

依序做這四件事，然後查稽核表：

1. 用 ws:client `join <roomId>`
2. 送一則訊息
3. 撤回它
4. 嘗試撤回別人的訊息（會回 404）

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db -c \
  "SELECT action, member_id, room_id, target_member_id, target_message_id, created_at
   FROM chat_audit_logs ORDER BY created_at;"
```

預期**四筆中只有三筆**：

| 動作 | 有沒有稽核 |
| --- | --- |
| 加入房間 | ✅ `ROOM_JOINED` |
| **送出訊息** | ❌ **沒有**——`chat_messages` 已經記了發送者、房間、時間、序號 |
| 撤回 | ✅ `MESSAGE_RETRACTED` |
| 撤回別人的 | ✅ `MESSAGE_RETRACT_REJECTED`，且 `target_member_id` 是對方 |

「送出訊息沒有稽核」是刻意的，不是漏掉——判準是「證據會不會消失」，
不是「這件事重不重要」。

## 4. 稽核不含內容

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db -c "\d chat_audit_logs"
```

預期：**沒有任何內容欄位**。內容已在 `chat_messages`（撤回也保留），
複製一份等於多一條洩漏路徑。

## 5. 稽核失敗不影響業務（需要動手製造故障）

把 `chat_audit_logs` 改名讓寫入失敗，再送訊息／離開房間：

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db -c \
  "ALTER TABLE chat_audit_logs RENAME TO chat_audit_logs_bak;"
```

預期：聊天**完全正常**，但伺服器日誌出現 error 等級的「稽核寫入失敗」。
驗完記得改回來：

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db -c \
  "ALTER TABLE chat_audit_logs_bak RENAME TO chat_audit_logs;"
```
