# add-admin-moderation 手動驗證

```bash
export API=http://localhost:3000/api/admin
export TOKEN=<有 BACKEND:MODERATION:VIEW + EDIT 的 accessToken>
export AUTH="Authorization: Bearer $TOKEN"
export REPORT=<某筆檢舉的 reportId>
```

## 1. ⭐ 稽核的切分：列表不記、詳情記

這是本 change 的核心，**兩步要連著做**：

```bash
# 先清空稽核表，讓觀察乾淨
docker compose exec -T postgres psql -U postgres -d nexus_db -c "DELETE FROM chat_audit_logs;"

# (a) 瀏覽列表
curl -s "$API/moderation/reports" -H "$AUTH" | jq '.data.list | length'

# 檢查：應該還是 0 筆稽核
docker compose exec -T postgres psql -U postgres -d nexus_db -c "SELECT count(*) FROM chat_audit_logs;"

# (b) 查看詳情
curl -s "$API/moderation/reports/$REPORT" -H "$AUTH" | jq '.data.contentSnapshot'

# 檢查：應該多一筆 REPORT_VIEWED
docker compose exec -T postgres psql -U postgres -d nexus_db \
  -c "SELECT action, member_id, target_member_id FROM chat_audit_logs;"
```

預期：(a) 之後稽核表是空的，(b) 之後有一筆 `REPORT_VIEWED`。

這個切分讓稽核量與**「實際看到了敏感內容的次數」**對齊，而不是與「點了幾下」對齊。

## 2. ⭐ 列表不含內容快照

```bash
curl -s "$API/moderation/reports" -H "$AUTH" | grep -c contentSnapshot
```

預期：`0`。列表看不到任何敏感內容——管理員必須為每一筆做出「我要看這個」的明確動作。

## 3. 被撤回的訊息仍看得到

讓被檢舉的訊息被其發送者撤回，再查一次詳情。

預期：`contentSnapshot` **仍是原內容**。撤回不該讓調查失去依據。

## 4. 權限分離

用**只有 `BACKEND:MODERATION:VIEW`** 的帳號：

```bash
# 查詳情 → 應該成功
curl -s -o /dev/null -w '%{http_code}\n' "$API/moderation/reports/$REPORT" -H "$AUTH_VIEW"

# 判定 → 應該 403
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH "$API/moderation/reports/$REPORT" \
  -H "$AUTH_VIEW" -H 'Content-Type: application/json' -d '{"status":"REVIEWED"}'
```

預期：`200` 與 `403`。「能看的人」與「能判的人」在真實團隊裡經常不是同一群。

## 5. 狀態流轉

```bash
curl -i -X PATCH "$API/moderation/reports/$REPORT" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"status":"REVIEWED","reviewNote":"已私下警告"}'

# 終態間更正 → 允許
curl -i -X PATCH "$API/moderation/reports/$REPORT" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"status":"DISMISSED"}'

# 改回待處理 → 應該 400
curl -i -X PATCH "$API/moderation/reports/$REPORT" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"status":"PENDING"}'
```

預期：`204` / `204` / `400`。回到待處理是「重新開啟」，語意與「終態間的更正」不同。

## 6. 行為時間軸

```bash
curl -s "$API/moderation/members/<某個 memberId>/timeline" -H "$AUTH" | jq '.data.list'
```

預期：只有該成員的紀錄，**不含任何訊息內容**（稽核表本來就不存內容）。
