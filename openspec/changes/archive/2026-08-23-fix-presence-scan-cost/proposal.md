## Why

`countOnlineMembers()` 在**請求路徑上掃整個 Redis keyspace**，而
`cache-keys.ts:34` 就寫著那個 pattern「**不可用於請求路徑**」：

```typescript
/** 掃描所有 presence key 的 pattern，供排程 sweep 使用（不可用於請求路徑） */
export const buildPresenceScanPattern = ...
```

這是 `add-admin-dashboard` 加的，違反的是同一份檔案自己寫下的約束——
**而註解不會失敗**，所以沒有任何東西擋下它。

成本結構最糟的地方不是掃描本身，是它掛在哪裡：
呼叫鏈是 `DashboardStream.publish()` → `GetDashboardSnapshotService.execute()` →
`countOnlineMembers()`，而 `DashboardStream` 的計時器預設 **5 秒**一次，
只要有一個管理員把儀表板開著就一直跑。

單次成本 = 一次掃過整個 keyspace 的 SCAN（會經過所有 `member:*`、`failed-login:*`、
`session:*` key）+ **N 次 HGETALL**（N = presence key 數）。
乘上每 5 秒一次、乘上 API 實例數。1 萬人在線就是每 5 秒 1 萬次 Redis round trip——
而那正是這個服務最忙的時候。

用 `scanIterator` 而非 `KEYS` 至少不會阻塞 Redis 主執行緒，這點是對的；
問題在**頻率與 N+1**，不在 SCAN 本身。

## What Changes

- **後端**：新增一個「目前在線成員」的 Redis SET，`markOnline` / `markOffline`
  在狀態真正轉換時維護它；`countOnlineMembers()` 改用 `SCARD`，成本從 O(N) 降到 **O(1)**。
- **後端**：`sweepStale` 的既有遍歷順手**校正**那個 SET（見 design.md D2）——
  實例被強制終止時 `markOffline` 不會被呼叫，SET 會單向累積漂移。
- **後端**：`RedisService` 補三個 SET 操作（`setAdd` / `setRemove` / `setCard`）。
- **守則**：新增「掃描 pattern 只能在 sweep 用」的架構守則——
  把 `cache-keys.ts` 那句註解變成機器可檢查的。

**不做**：

- **審查報告建議的計數器（INCR/DECR）**。漂移的方向是**單向累積**的
  （實例當機時 `markOffline` 不會執行，計數只增不減），而它建議的
  「由 sweepStale 順便校正」對計數器而言仍然需要掃一次才知道真值。
  SET 的校正可以在 sweep **既有的遍歷**裡順手完成，成本幾乎為零。
- **把快照整份快取住**。那只是讓成本與 SSE 間隔脫鉤，沒有解決
  「成本隨在線人數線性成長」——而後者才是會咬人的那個。
- **改變連線紀錄的儲存結構**。連線仍然是帶心跳時間的 Hash，
  這一點是 `platform-websocket-transport` 明文要求的（見 design.md D1）。

## Capabilities

### Modified Capabilities

- `platform-websocket-transport`：「在線狀態必須跨實例一致且不留殭屍」補上
  衍生索引的規則；新增「在線人數的查詢成本不得隨在線人數成長」。

## Impact

- **後端**：`RedisPresenceAdapter`（`markOnline` / `markOffline` / `countOnlineMembers` /
  `sweepStale`）、`RedisService`（三個 SET 操作）、`cache-keys.ts`（新 key）。
- **測試**：e2e 的 Redis mock 需補 SET 操作（`test/setup/test-app.ts`）。
- **無 migration**、**無新環境變數**、**前端不受影響**。
- **既有部署的相容性**：SET 一開始是空的，`sweepStale` 第一次執行（預設 15 秒內）
  就會把它校正到正確值。中間這段時間在線人數會偏低——這是可接受的，
  而且只發生在部署後的第一個 sweep 週期內。
