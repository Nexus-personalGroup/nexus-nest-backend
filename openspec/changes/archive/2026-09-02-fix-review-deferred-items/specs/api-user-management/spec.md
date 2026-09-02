## ADDED Requirements

### Requirement: 前台使用者的模糊搜尋必須用得到索引

前台使用者列表（`GET /api/admin/front-users`）的 `email` 與 `displayName`
模糊搜尋 SHALL 由資料庫索引支援，MUST NOT 退化為全表掃描。

**本需求不是 endpoint 契約**——請求與回應形狀、搜尋語意都由
「前台使用者列表查詢」定義且不受本需求影響，這裡約束的只是它怎麼被執行。

兩個欄位都以不分大小寫的子字串比對（Prisma 的 `contains` +
`mode: 'insensitive'`，翻成 `ILIKE '%x%'`）。**B-tree 索引對前後都有萬用字元的
樣式無效**——`email` 雖有 unique 索引也用不上，`displayName` 則根本沒有索引。

實作 MUST 使用 `pg_trgm` 的 GIN 索引：它加速 `ILIKE '%x%'` 而
**完全不改變比對語意**。MUST NOT 為了效能把搜尋改成前綴比對——
那會改變行為（使用者輸入 `@gmail.com` 就再也找不到人），
屬於產品決定而非效能調整。

索引 MUST 宣告於 `schema.prisma`，MUST NOT 只寫在 migration SQL 裡：
Prisma 比對 schema 與 migration 產生的 shadow DB 時會看到「DB 有、schema 沒有」
的索引，**下一次 `migrate dev` 會產生一支把它刪掉的 migration**。
extension 本身（`CREATE EXTENSION`）則相反——未啟用 `postgresqlExtensions`
preview 時 Prisma 不追蹤 extension，寫在 migration 裡不會造成 drift。

**一個已知限制 MUST 記錄在案**：`pg_trgm` 以三字元為單位建索引，
**搜尋字串少於 3 個字元時索引用不上**，仍會退回全表掃描。
不寫下來的話，下一個量到「搜兩個字還是很慢」的人會以為索引沒建成功。

#### Scenario: ⭐ 以 email 片段搜尋

- **WHEN** 管理員以 `email=gmail` 查詢
- **THEN** 查詢 MUST 使用 GIN 索引，且結果與加索引前**完全相同**

#### Scenario: ⭐ 搜尋語意不得改變

- **WHEN** 管理員以 `email=@gmail.com` 查詢（樣式出現在字串中段或尾端）
- **THEN** MUST 仍然比對得到——實作 MUST NOT 改為前綴比對

#### Scenario: 少於三字元的搜尋

- **WHEN** 搜尋字串只有 1–2 個字元
- **THEN** 結果仍 MUST 正確；效能退回全表掃描是已知且被接受的
