# add-admin-message-removal 手動驗證

```bash
export ADMIN=http://localhost:3000/api/admin
export FRONT=http://localhost:3000/api/front
export AUTH="Authorization: Bearer <有 BACKEND:MODERATION:EDIT 的 token>"
export MSG=<某則訊息的 messageId>
```

## 1. 移除

```bash
curl -i -X DELETE "$ADMIN/moderation/messages/$MSG" -H "$AUTH"
```

預期：`204`，且房間內所有連線收到 `server:messageRemoved`
（用 `ws:client` 掛著觀察；payload **不含 content**）。

## 2. ⭐ 移除與撤回在前台是不同的狀態

```bash
curl -s "$FRONT/chat-rooms/<roomId>/messages" -H "$MEMBER_AUTH" \
  | jq '.data.list[] | {seq, content, retractedAt, removedAt}'
```

預期該則：

```json
{ "seq": 42, "content": "", "retractedAt": null, "removedAt": "2026-..." }
```

**`retractedAt` 必須是 null** —— 那是本 change 的核心。共用欄位會讓發送者
以為自己撤回了（他沒有），也讓後台無法統計「被移除幾則」。

前台應據此顯示「此訊息因違反規範被移除」，而不是「訊息已收回」。

## 3. 內容仍在資料庫（刻意的）

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db \
  -c "SELECT seq, content, retracted_at, removed_at, removed_by FROM chat_messages ORDER BY seq;"
```

預期：`content` **原封不動**。被移除的訊息正是最需要留下證據的那些——
檢舉調查、申訴、日後的爭議都要看得到原文。

## 4. ⭐ 還原不碰撤回狀態

先讓發送者自己撤回一則，再由管理員移除它，然後還原：

```bash
curl -i -X POST "$ADMIN/moderation/messages/$MSG/restore" -H "$AUTH"
```

預期：`removed_at` 清除、**`retracted_at` 保留**。它回到「已收回」而非完全正常。
房間收到 `server:messageRestored`，payload 帶 `retractedAt`（有值）。

## 5. 冪等

- 對同一則連續移除兩次 → 兩次都 `204`，`removed_at` 維持第一次的時間，**不重複推播**
- 對未被移除的訊息執行還原 → `204`，**不推播、不寫稽核**

## 6. 稽核

```bash
docker compose exec -T postgres psql -U postgres -d nexus_db \
  -c "SELECT action, member_id, target_member_id FROM chat_audit_logs ORDER BY created_at;"
```

預期：`MESSAGE_REMOVED` 與 `MESSAGE_RESTORED` 各一筆。
**還原也記**是刻意的——`removed_at` 清除後，「這則曾被移除過」就不再留在訊息列上，
而反覆移除再還原本身就是可疑行為。

## 7. 權限

用**只有 `BACKEND:MODERATION:VIEW`** 的帳號執行移除或還原。

預期：`403`，且訊息狀態不變。
