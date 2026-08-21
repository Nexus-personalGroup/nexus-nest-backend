# add-admin-moderation-ui 手動驗證

前置：`pnpm dev` 起前後端，用有 `BACKEND:MODERATION:VIEW` + `EDIT` 的帳號登入後台。
需要至少一筆檢舉——沒有的話從前台送一則訊息再檢舉它，或直接寫一筆：

```sql
INSERT INTO chat_reports
  (id, reporter_id, target_message_id, target_member_id, room_id, reason, content_snapshot)
VALUES
  (gen_random_uuid(), '<檢舉人 id>', '<訊息 id>', '<被檢舉人 id>', '<房間 id>', 'HARASSMENT', '測試內容');
```

## 1. 佇列顯示的是人不是 UUID

進 `/moderation/reports`，確認「檢舉人」「被檢舉人」兩欄是 **email**。

這是這個 change 的起點：後端原本只回 UUID，而前端補不了——
`/members/{id}` 需要 `BACKEND:ACCOUNT:VIEW`，審閱人員沒有那個權限。

## 2. ⭐ 只有 VIEW 權限時處置動作是「停用」而非「消失」

**這一項 CI 驗不到，必須人工看。**

用只有 `BACKEND:MODERATION:VIEW`（沒有 `EDIT`）的帳號登入，進任一筆檢舉詳情。預期：

- 四個處置按鈕與判定表單**都看得見**，但全部灰掉
- 滑鼠移上去顯示「無處置權限」

隱藏會讓人以為功能不存在，然後去問「為什麼我不能移除訊息」——
停用加上理由則當場回答了那個問題。

## 3. 移除與還原二選一

用有 EDIT 權限的帳號，在詳情頁：

1. 確認顯示的是「移除訊息」，不是兩顆按鈕同時出現
2. 按下去 → 跳確認視窗 → 確認
3. 畫面重新載入後，該按鈕變成「還原訊息」，且快照下方出現「此訊息已於 … 被移除」
4. 按「還原訊息」→ 確認 → 按鈕變回「移除訊息」，移除提示消失

第 3 步是後端補 `targetMessageRemovedAt` 的唯一理由：沒有它，按鈕只能盲按。

## 4. 帳號被刪除的檢舉仍然可審閱

把某筆檢舉的被檢舉人軟刪除：

```sql
UPDATE members SET deleted_at = NOW() WHERE id = '<被檢舉人 id>';
```

回佇列，確認該列的「被檢舉人」顯示**「已刪除的帳號（尾 8 碼）」**而不是空白格，
且該筆檢舉仍然可以點進去、可以判定。

`chat_reports` 刻意不建外鍵就是為了這個情境。驗完記得改回 `deleted_at = NULL`。

## 5. ⭐ 稽核只記真正的查看

開瀏覽器 DevTools 的 Network，然後：

1. 在佇列頁把滑鼠移過每一列（**不要點**）→ 確認**沒有**任何 `reports/<id>` 請求
2. 點進一筆詳情 → 一筆請求
3. 切到別的瀏覽器分頁再切回來 → **不會**再發一次

查詳情每次都會在後端寫一筆 `REPORT_VIEWED`，稽核量必須與「實際看到敏感內容的次數」
對齊。第 1 步是最容易被「優化」掉的：hover 預載只有一行程式碼，加上去畫面更順、
沒有任何測試會紅，而稽核紀錄從此失去意義。

用 SQL 對一下：

```sql
SELECT action, created_at FROM chat_audit_logs
 WHERE action = 'REPORT_VIEWED' ORDER BY created_at DESC LIMIT 10;
```

**已知**：每做一次處置（移除／還原／停權／解除）會多一筆 `REPORT_VIEWED`——
處置後畫面重新載入詳情，那確實是又看了一次內容。

## 6. 判定

在詳情頁的判定區選「已處理」、填註記、送出。預期：

- 成功 toast，狀態徽章變成「已處理」，上方出現判定時間與註記
- 下拉只有「已處理」與「已駁回」兩個選項（沒有「待處理」——後端不接受）
- 註記貼超過 500 字 → 前端當場擋下，不會送出去才被伺服器打回

## 7. 時間軸

詳情頁右側應顯示被檢舉人的行為紀錄（中文動作 + 相對時間）。
剛才做的移除／還原／停權會出現在這裡——那正是「初犯還是慣犯」要看的東西。
沒有紀錄的成員顯示「無行為紀錄」而不是錯誤。
