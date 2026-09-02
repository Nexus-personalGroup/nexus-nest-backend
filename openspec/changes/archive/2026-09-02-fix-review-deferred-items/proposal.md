## Why

兩項審查報告標為「刻意不做」的項目，現在做。它們在 `tasks/todo.md`
「已知缺口（知情，非遺漏）」底下躺著，各自的不做理由都寫得很清楚——
**這支 change 推翻的是那兩個判斷，所以理由要留得下紀錄。**

**① WS 連線數上限有 TOCTOU**（第一輪審查問題 10）。`ChatGateway` 先
`getConnections()` 讀、比對 `WS_MAX_CONNECTIONS_PER_MEMBER`、再 `markOnline()` 寫。
兩條連線同時進來會**都通過檢查**，於是上限形同建議值。
`fix-security-cleanup` 當時判斷「超個一兩條沒有實質危害，修法複雜度不成比例」。

**② `listUsers` 的模糊搜尋會全表掃描**（第二輪審查問題 6）。
`contains` + `mode: 'insensitive'` 翻成 `ILIKE '%x%'`，`email` 的 unique index
用不到（B-tree 不支援前後萬用字元）、`displayName` 根本沒有索引。

**更正一個先前的判斷**：todo 上寫著這項要「先確認要哪一種搜尋語意再選」，
把它當成卡在產品決定。**那是過度保守**——`pg_trgm` 的 GIN 索引
**完全保留現有的 `ILIKE '%x%'` 語意**，只是讓它用得到索引。
不改任何行為，因此沒有要決定的事。

## What Changes

- **連線上限改成「寫入後回讀」**：`markOnline` 之後重新讀連線清單，
  依 `lastSeenAt` 排序後找出自己的位置；超出上限就撤掉自己剛寫的那筆並拒絕。
  **排序是決定性的**，所以兩條同時進來時只有真正超額的那條被拒，
  不會兩條互相禮讓也不會兩條都留下（見 design D1）。
- **連線上限的行為寫進 spec**：它目前只存在於程式碼，`platform-websocket-transport`
  沒有任何需求描述它。
- **`users` 的 email 與 displayName 加 `pg_trgm` GIN 索引**：
  一支 migration 建立 extension，索引宣告在 `schema.prisma` 讓 Prisma 認得
  （見 design D3——只寫在 migration 裡會被 Prisma 當成 drift）。

**不做**：不改搜尋語意（仍是不分大小寫的子字串比對）；
不改 `WS_MAX_CONNECTIONS_PER_MEMBER` 的預設值；
不碰 `members` 那側的搜尋（那張表的量級與存取模式都不同，沒有實測依據就不動）。

## Capabilities

### Modified Capabilities

- `platform-websocket-transport`：新增「單一成員的連線數上限必須真的是上限」。
- `api-user-management`：新增「前台使用者的模糊搜尋必須用得到索引」。
  **不改「前台使用者列表查詢」那條**——請求與回應形狀、搜尋語意都不變，
  改的只是它底下怎麼被執行，那是另一件事。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | **有 migration**：`CREATE EXTENSION pg_trgm` + 兩個 GIN 索引 |
| 環境變數 | 無 |
| API 契約 / Swagger | 無（搜尋語意不變、回應形狀不變） |
| 前端 | 無 |
| 行為變更 | 連線數達上限時，**同時進來的第 N+1 條會被確實拒絕**（以前可能溜進去） |

⚠️ **部署要跑 migration**。`CREATE EXTENSION` 需要資料庫使用者具備建立
extension 的權限——本地與 CI 都是 superuser，正式環境若非 superuser 會失敗，
屆時要請 DBA 先建好 extension（`IF NOT EXISTS` 讓 migration 仍可重跑）。
