# add-admin-dashboard 手動驗證

前置：`.env` 加上 `DASHBOARD_STREAM_INTERVAL_SEC=5`（不加會用預設值 5），
`pnpm dev`，用有 `BACKEND:MODERATION:VIEW` 的帳號登入。

## 1. 基本

進 Sidebar 的「營運總覽」，確認：

- 五個數字**立即出現**，不是先空白五秒——連線建立時伺服器會馬上推一次
- 「最後更新於 X 秒前」會自己往前跳，且每 5 秒歸零一次
- 只有「待處理檢舉」是連結，點下去到檢舉佇列
- 「今日訊息數」旁的 ⓘ 說明日界依系統時區

## 2. ⭐ 一個實例只查一次

**這一項只有人工驗得到。**

開**三個分頁**都停在儀表板，然後看後端 log（或用下面的 SQL 看查詢次數）。
預期：每 5 秒只有**一組**查詢，不是三組。

```sql
-- 開 pg_stat_statements 的話可以直接看；沒開就看應用的 query log
SELECT calls, query FROM pg_stat_statements
 WHERE query LIKE '%chat_messages%count%' ORDER BY calls DESC LIMIT 3;
```

寫成「每個連線各自 setInterval」是最直覺的實作，而它會讓 10 個管理員
變成 10 倍的資料庫負載——**那種放大在開發時看不出來，因為自己只開一個分頁**。

順便驗反面：把三個分頁**全部關掉**，確認查詢停止。
一個沒有人在看的頁面不該持續打資料庫。

## 3. ⭐ 把後端停掉，畫面要說實話

**這是這個頁面最重要的一項。**

停在儀表板，然後 `Ctrl-C` 掉後端。預期：

1. 幾秒內出現「**連線中斷，重新連線中——以下為過期的數字**」
2. 五個數字變成刪除線的灰色樣式
3. 重新啟動後端 → 提示消失、數字恢復正常、「最後更新於」重新計時

**如果數字安靜地停在原地而沒有任何標示，那就是這個 change 最重要的規則壞了**——
一個顯示 20 分鐘前數字的儀表板比沒有儀表板更糟：它讓人以為自己知道現況。

順便看 DevTools 的 Network：重連應該是**間隔越來越長**（1s → 2s → 4s…），
不是每秒重試。立刻重連在伺服器重啟期間會變成密集重試，而那正是它最脆弱的時刻。

## 4. 今日訊息數的日界

**台灣時間 00:00–08:00 之間做這一項最有意義**（那段時間 UTC 還是「昨天」）。

送一則訊息，確認「今日訊息數」+1。如果日界寫成 UTC，凌晨送的訊息不會被計入——
而那種錯誤只在特定時段出現，很難被回報也很難重現。

不在那個時段的話，可以直接改資料庫的 `created_at` 驗：

```sql
UPDATE chat_messages SET created_at = date_trunc('day', now() AT TIME ZONE 'Asia/Taipei')
  AT TIME ZONE 'Asia/Taipei' + interval '30 minutes' WHERE id = '<訊息 id>';
```

## 5. 權限

用只有 `BACKEND:ACCOUNT:VIEW` 的帳號登入：

- Sidebar 看不到「營運總覽」
- 直接打 `/moderation/dashboard` 會被導回首頁，
  且 Network 上**沒有** `dashboard/stream` 的連線

## 6. 離開頁面要斷線

從儀表板切到別的頁面，看 DevTools 的 Network——
`dashboard/stream` 那條連線應該被取消，不是留在背景繼續收。
