## Context

模板 `hexagonal-nest-express-mysql` 綁定 MySQL / MariaDB：Prisma provider、driver adapter、建庫腳本、compose 服務、CI service container 五處都寫死。nexus 從模板衍生，但產品方向（即時聊天 + 行為監控）對資料庫的要求與模板的通用後台不同。

耦合點盤點後只有 14 個檔案，且全部集中在基礎設施層——六角架構把資料庫關在 `adapter/out/persistence` 與 `infrastructure/prisma` 之內，`application` 與 `domain` 兩層零改動。這是架構本身付出的回報，也是「現在換」可行的原因。

## Goals / Non-Goals

**Goals:**

- 完整切換到 PostgreSQL，驗證鏈六項全綠（`docker:deps` / `db:migrate` / `typecheck` / `lint` / `test` / `build`），e2e 對真實 PostgreSQL 通過
- 保留模板既有的 object-config Prisma 連線形式——e2e 的隔離機制建立在覆寫 `DB_DATABASE` 之上，不能退化成 URL 拼接
- 時間欄位的 UTC 保證要有**機制**，不能只靠慣例

**Non-Goals:**

- **不引入任何 PostgreSQL 專屬功能**——JSONB 欄位、BRIN 索引、`LISTEN/NOTIFY` 都是 M3 監控埋點時才需要的。這次只換底座，換完的行為要與換之前等價
- 不調整既有資料模型的欄位、關聯、索引語意
- 不處理正式環境部署與資料遷移（本專案尚未部署）

## Decisions

### D1：刪除既有 migration 重新產生，而非補一支轉換 migration

**選**：刪掉 3 支 MySQL migration 與 `migration_lock.toml`，以 `migrate dev` 產生單一 init migration。

**不選「保留歷史 + 補一支 PG migration」**：Prisma 的 migration 是 provider-specific 的原始 SQL——MySQL 的 `ALTER TABLE ... MODIFY COLUMN` 在 PostgreSQL 語法上就不存在。`migration_lock.toml` 更會在 provider 不符時直接讓 `migrate` 報錯拒絕執行，這不是可以繞過的檢查，而是 Prisma 刻意設計的防呆。

**成立條件**：本專案零部署、零資料、無其他開發者的本機庫。**這個條件在 M1 開始寫聊天資料表之後就不再成立**——所以要換就是現在，這是 D1 能這麼簡單的唯一理由。

### D2：時間欄位改用 `timestamptz`，取代 driver 層強制 UTC

MySQL 版的 UTC 保證來自 adapter 的 `timezone: 'Z'` 參數。PostgreSQL 沒有等價參數，兩條路：

**選 `@db.Timestamptz(3)`**：欄位型別本身帶時區語意。PostgreSQL 一律以 UTC 儲存，回傳時附帶時區資訊，driver 設定與 Node 行程的 `TZ` 都影響不到它。

**不選「維持 `timestamp` + 靠紀律」**：`timestamp without time zone` 經 `pg` driver 解析成 JS `Date` 時會套用**Node 行程的本機時區**。一個 `TZ` 環境變數的差異就足以讓 CI（通常 UTC）與開發機（Asia/Taipei）得到相差 8 小時的結果，而且**不會報錯，只會靜默偏移**。nexus 之後要靠時間戳做訊息排序與稽核事件對齊，靜默偏移的代價遠高於在 schema 多寫一個註記。

**代價**：schema 中每個 `DateTime` 欄位多一個 `@db.Timestamptz(3)`。儲存成本無差異——PostgreSQL 的 `timestamp` 與 `timestamptz` 都是固定 8 bytes。

> 這條同時也修掉一個模板既有的脆弱點：MySQL 版的 UTC 保證寫在 `PrismaService` 建構子裡，任何人改連線設定時漏掉那一行就靜默失效，沒有任何檢查會發現。改成型別層之後，它由 schema 保證。

### D3：PostgreSQL 17

**不選 18**：模板的價值之一是「本機 / CI / 未來部署共用同一條版本線」。17 的容器映像、託管服務（RDS / Cloud SQL / Zeabur / Supabase）支援面最廣，18 尚未全面到位。

**不選 16**：無理由落後兩個版本。

### D4：保留 object-config，不改用 `DATABASE_URL`

`@prisma/adapter-pg` 接受 `pg` 的 `PoolConfig`，host / port / user / password / database 逐欄傳入的形式完整保留，這條路不需要任何妥協。

**必須保留的原因**：e2e 的資料庫隔離機制正是「把 `DB_DATABASE` 覆寫成 `*_test`」，`globalSetup` 還會檢查庫名結尾是否為 `_test` 才允許 migrate / reset。改成 URL 形式後這個覆寫要退化成字串拼接與重新解析，而模板已記載過「密碼含特殊字元時 URL parser 會炸」。

### D5：對外埠 5442（dev）/ 15432（verify）

沿用模板既有需求「所有對外埠避開預設值」。位移邏輯與原本一致：3306→3316 對應 5432→5442，13306 對應 15432。

### D7：欄位描述寫兩層，SQL 由產生器輸出

實作途中追加的範圍。原本只打算換底座，但 init migration 是**唯一一次能免費重建整個 schema 的機會**——
等 M1 開始加聊天資料表之後，補描述就得另開 migration 一張表一張表補。

**兩層是必要的，不是重複**：

| 層 | 機制 | 讀者 |
| --- | --- | --- |
| Prisma Client JSDoc | `///` 經 `prisma generate` 自動帶入 | 寫程式的人，IDE hover |
| PostgreSQL `COMMENT ON` | 手動寫進 migration | 直接查庫的人、DBeaver、**未來的後台監控介面** |

**關鍵事實：Prisma 不會從 `///` 產生 `COMMENT ON`。** 只加 `///` 的話 migration 的 SQL
一個字都不會變。這點極易誤判成「加了註解就會進資料庫」。

**不選「只寫 `///`」**：nexus 的後台監控要讓管理員看得懂資料，而查庫的人（含之後接 BI / 報表的）
看不到 Prisma 的型別檔。

**不選「只寫 `COMMENT ON`」**：寫程式時看不到，等於平常沒人會讀。

**不選「手寫 69 條 `COMMENT ON`」**：兩邊各寫一次必然漂移。改由 `gen:comments`
解析 `schema.prisma` 的 `///` 產生 SQL，單一真相仍是 schema。

**已知缺口**：「改了 `///` 但忘記開 migration」目前沒有檢查會發現，屬自律項。
補一條架構守則（比對 schema 的 `///` 與 migration 中的 `COMMENT ON` 是否一致）
是合理的後續 change，但不在本次範圍。

**描述內容的取捨**：寫功能與陷阱，不寫欄位名翻譯。`id`、一般的 `created_at` / `updated_at`
刻意不寫——CLAUDE.md 的「No comments on self-explanatory code」在 schema 同樣適用，
給每個欄位都硬湊一句只會稀釋真正重要的那幾條（如 `token_version`、`password_reset_tokens.token`）。

### D6：移除 `allowPublicKeyRetrieval` 相關處置

該參數是為了繞過 MySQL 9 的 `caching_sha2_password` 在非 TLS 本機連線下取 RSA 公鑰失敗的問題。PostgreSQL 用 scram-sha-256，沒有這個握手階段，整段連同註解一起刪除——留著會誤導下一個讀的人。

## Risks / Trade-offs

- **[欄位長度限制消失]** 未標 `@db.VarChar(n)` 的 `String` 欄位在 MySQL 是 `varchar(191)`，在 PostgreSQL 變成無長度上限的 `text` → 邊界驗證本來就在 Zod 那層做，DB 層限制從未被當成防線；且 `user_agent`、`detail`、`reason` 這類欄位在 MySQL 反而是會被 191 靜默截斷的隱患，這次一併解除。**緩解：實作時確認沒有任何測試依賴「超長輸入被 DB 拒絕」的行為**——若有，那條測試驗的是錯的東西，要改成驗 Zod。

- **[`DROP DATABASE` 被既有連線擋下]** PostgreSQL 不允許 drop 有 active connection 的資料庫，MySQL 沒這個限制 → `drop-database.ts` 使用 `WITH (FORCE)`（PostgreSQL 13+ 支援），並先連到 `postgres` 這個維護庫而非目標庫。

- **[adapter 與 client 版號不齊]** 目前 `@prisma/client` 鎖在 7.8.0，`@prisma/adapter-pg` 最新為 7.9.1 → 實作時確認 pnpm 的解析結果；不齊就把 `prisma` / `@prisma/client` / `@prisma/adapter-pg` 三者一起提到同一版，不要單獨降 adapter。

- **[raw SQL 方言差異]** 日誌清理排程使用手寫 raw SQL（模板第二輪審查時從 `deleteMany` 改過去的），MySQL 與 PostgreSQL 的 `LIMIT` 在 `DELETE` 語句中的支援不同——PostgreSQL 的 `DELETE` 不支援 `LIMIT`，需改寫成 `DELETE ... WHERE id IN (SELECT id ... LIMIT n)` → 獨立一塊處理，且該處已有單元測試與對真 DB 的 e2e，改完由測試證明。

- **[一次性全綠的假象]** 所有 e2e 會第一次跑在新資料庫上，若某支測試碰巧沒被 provider 差異打到，不代表它驗證了 PostgreSQL 的行為 → 收尾要求反向驗證：刻意改壞連線設定與 raw SQL，確認對應測試真的變紅。

## Migration Plan

本專案尚未部署，不涉及正式環境遷移。本機步驟（**粗體為使用者手動執行**）：

1. `pnpm docker:down` 停掉舊的 MySQL 容器
2. `docker compose down -v` 移除 `mysql-data` volume（資料不需保留）
3. **修改 `apps/api/.env`**：`DB_PORT=5442`、`DB_USERNAME=postgres`、`DB_PASSWORD`、`DB_DATABASE`、`DB_TEST_DATABASE`
4. `pnpm install` 安裝新依賴
5. `pnpm docker:deps` 起 postgres + redis
6. `pnpm --filter @app/api db:migrate` 產生並套用 init migration
7. `pnpm --filter @app/api db:seed`

**回滾**：本 change 全部落在單一分支，`git checkout develop` + `docker compose down -v` 後重起即回到 MySQL 版本。因為沒有資料，回滾成本為零——這也是選在此時執行的原因之一。
