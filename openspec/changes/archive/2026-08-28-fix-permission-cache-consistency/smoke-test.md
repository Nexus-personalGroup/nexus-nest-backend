# Smoke Test — fix-permission-cache-consistency

沒有新端點，這個 change 改的是 `PATCH /api/admin/roles/:id` 的**副作用**。
因此重點不是「回不回 204」，而是**改完之後、既有的那個 token 還通不通**。

前置：`pnpm docker:up`（或至少 `docker compose up -d postgres redis`）+ `pnpm dev`。

---

## 1. 撤銷權限立即生效（核心）

```bash
# 準備：兩個帳號——admin（有 BACKEND:ROLE:EDIT）與 victim（有 BACKEND:ACCOUNT:VIEW）
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"YourPass123!"}' | jq -r '.data.accessToken')

VICTIM_TOKEN=$(curl -s -X POST http://localhost:3000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"victim@example.com","password":"YourPass123!"}' | jq -r '.data.accessToken')
```

```bash
# ① 先成功打一次，讓 MemberContext 進快取（沒有這一步就驗不到東西）
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/admin/members \
  -H "Authorization: Bearer $VICTIM_TOKEN"
# 期望：200
```

```bash
# ② 確認快取真的寫進去了
docker compose exec redis redis-cli --scan --pattern 'nest:member:*'
# 期望：看得到 victim 的 memberId
```

```bash
# ③ 把權限從 victim 的角色移除（VICTIM_ROLE_ID 換成實際值）
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH \
  "http://localhost:3000/api/admin/roles/$VICTIM_ROLE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"permissionCodes":[]}'
# 期望：204
```

```bash
# ④ 同一個 token，下一個請求就要被擋——不是等五分鐘
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/admin/members \
  -H "Authorization: Bearer $VICTIM_TOKEN"
# 期望：403
```

**修好之前這裡會是 200**，而且會持續 200 到 `PERMISSION_CACHE_TTL` 到期為止。

## 2. 授予權限立即生效

把 ③ 換成 `{"permissionCodes":["BACKEND:ACCOUNT:VIEW"]}`，④ 期望 **200**，
且**不需要重新登入**。

## 3. 只改名稱也清

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH \
  "http://localhost:3000/api/admin/roles/$VICTIM_ROLE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"檢視人員"}'

docker compose exec redis redis-cli --scan --pattern 'nest:member:*'
# 期望：victim 的 key 不見了
```

## 4. Redis 掛掉時整個更新失敗（刻意的）

```bash
docker compose stop redis
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH \
  "http://localhost:3000/api/admin/roles/$VICTIM_ROLE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":false}'
# 期望：5xx，不是 204
docker compose start redis
```

不吞錯誤是設計決定（design D4）：語意是「權限改了但沒有生效」，
回 204 會讓操作者以為改好了。

---

## 5. ⭐ 只有人工驗得到的：兩個分頁

自動化測試驗的是 HTTP 層與快取層。**「操作中的人會不會當場被擋下」只有這樣才看得到**：

1. 分頁 A：用 victim 帳號登入後台，停在帳號管理列表，**不要重新整理**。
2. 分頁 B：用 admin 帳號把 victim 角色的 `BACKEND:ACCOUNT:VIEW` 拿掉。
3. 回到分頁 A，點下一頁 / 換個篩選——**任何一次操作**。

**期望**：立刻被擋（403 → 前端導回登入或顯示無權限）。
**修好之前**：他可以繼續正常翻頁，最久五分鐘。

這一步是整個 change 的實際目的；前四項只是它的機械化替身。
