# add-chat-report 手動驗證

```bash
export API=http://localhost:3000/api/front
export TOKEN=<A 的 accessToken>   # A 與 B 同房間，訊息由 B 發出
export AUTH="Authorization: Bearer $TOKEN"
export MSG=<B 發的 messageId>
```

## 1. 檢舉

```bash
curl -s -X POST "$API/chat-reports" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"messageId\":\"$MSG\",\"reason\":\"HARASSMENT\",\"description\":\"持續辱罵\"}" | jq
```

預期：`200`，`data.status` 為 `PENDING`。
**回應不含被檢舉者 ID，也不含內容快照**——檢舉人已經知道那是誰，
回傳只會多一條可被用來確認身分的路徑。

## 2. ⭐ 重複檢舉（冪等）

把同一條指令再跑一次。

預期：`200`，**`reportId` 與第一次相同**。確認 DB 只有一筆：

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db \
  -c "SELECT count(*) FROM chat_reports;"
```

## 3. ⭐ 檢舉已撤回的訊息

先讓 B 撤回那則訊息，再用 A 檢舉它（換一個 messageId 或先清掉第 1 步的檢舉）。

預期：**照常受理**，且快照是原內容而非空字串：

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db \
  -c "SELECT reason, content_snapshot, status FROM chat_reports;"
```

撤回不該讓行為變得無法檢舉——沒有快照的話，管理員會看到一則空訊息，
而檢舉人明明看到了東西。

## 4. 授權

```bash
# 用不是該房間成員的帳號
curl -i -X POST "$API/chat-reports" -H "Authorization: Bearer <C 的 token>" \
  -H 'Content-Type: application/json' -d "{\"messageId\":\"$MSG\",\"reason\":\"SPAM\"}"

# 檢舉不存在的訊息
curl -i -X POST "$API/chat-reports" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"messageId":"00000000-0000-4000-8000-0000000000ff","reason":"SPAM"}'
```

預期：兩者都是 `404` + `CHAT_MESSAGE_NOT_FOUND`（**同一個錯誤碼**，
否則可用它探測任意訊息是否存在）。

```bash
# 用 B 自己檢舉自己發的訊息
curl -i -X POST "$API/chat-reports" -H "Authorization: Bearer <B 的 token>" \
  -H 'Content-Type: application/json' -d "{\"messageId\":\"$MSG\",\"reason\":\"SPAM\"}"
```

預期：`400` + `CHAT_REPORT_SELF`（**不與上面共用**——能走到這裡代表訊息確實存在
且確實是自己發的，沒有洩漏疑慮）。

## 5. 被檢舉者不知情

用 B 的帳號把所有前台端點打一輪（房間列表、訊息歷史、已讀）。

預期：**沒有任何地方顯示「你被檢舉了」**，也沒有收到任何 WS 推播。

## 6. 稽核

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db \
  -c "SELECT action, member_id, target_member_id FROM chat_audit_logs ORDER BY created_at;"
```

預期：有一筆 `REPORT_SUBMITTED`，`member_id` 是檢舉人、`target_member_id` 是被檢舉者。
