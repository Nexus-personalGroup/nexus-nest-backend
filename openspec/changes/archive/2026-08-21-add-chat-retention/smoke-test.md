# add-chat-retention 手動驗證

> 清理是排程觸發的，手動驗證要嘛等 cron、要嘛直接呼叫 service。
> 這裡用 psql 造資料 + 觀察排程日誌。

## 1. 先看影響範圍（**部署前務必做這一步**）

清理不可逆。啟用前先確認會刪掉多少：

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db -c "
  SELECT 'audit' AS t, count(*) FROM chat_audit_logs
    WHERE created_at < now() - interval '180 days'
  UNION ALL
  SELECT 'reports', count(*) FROM chat_reports
    WHERE reviewed_at < now() - interval '365 days' AND status <> 'PENDING';
"
```

## 2. 造測試資料

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db -c "
  INSERT INTO chat_audit_logs (id, member_id, action, created_at)
  VALUES (gen_random_uuid(), '<某個 memberId>', 'ROOM_LEFT', now() - interval '200 days');
"
```

## 3. 觸發清理

把 `CHAT_RETENTION_CRON` 暫時改成 `*/10 * * * * *`（每 10 秒），重啟服務。

預期日誌：

```
聊天資料保留排程啟動：*/10 * * * * *（稽核 180 天、檢舉判定後 365 天）
聊天資料清理完成：稽核 1 筆（保留 180 天）、已判定檢舉 0 筆（判定後保留 365 天）
```

驗完把 cron 改回來。

## 4. ⭐ 三件要確認的事

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db -c "
  SELECT 'audit_remaining' AS t, count(*) FROM chat_audit_logs
  UNION ALL SELECT 'messages', count(*) FROM chat_messages
  UNION ALL SELECT 'pending_reports', count(*) FROM chat_reports WHERE status = 'PENDING';
"
```

| 檢查 | 預期 |
| --- | --- |
| 逾期的稽核 | **已刪除** |
| `chat_messages` | **筆數完全不變**——訊息刻意不清（清了會讓 `seq` 出現洞） |
| 未判定的檢舉 | **一筆都沒少**，即使建立於很久以前 |

第三項特別重要：按建立時間清會讓積壓的佇列**靜默地把證據刪掉**，
而積壓正是最需要那些證據的時候。

## 5. 關閉時要看得見

把 `CHAT_RETENTION_ENABLED=false` 重啟。

預期日誌出現 **warn** 等級（不是 log）：

```
聊天資料保留排程已停用（CHAT_RETENTION_ENABLED=false）——稽核紀錄與檢舉將無界成長
```

無界成長是知情的選擇，不該無聲發生。
