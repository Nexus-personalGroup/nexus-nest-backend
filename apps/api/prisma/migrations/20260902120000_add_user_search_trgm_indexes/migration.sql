-- 前台使用者的模糊搜尋加 pg_trgm GIN 索引
--
-- 後台的 email / displayName 搜尋是 `contains` + `insensitive`，翻成 `ILIKE '%x%'`。
-- 前後都有萬用字元時 B-tree 完全用不上——email 雖有 unique 索引也一樣，
-- displayName 則根本沒有索引。pg_trgm 的 GIN 索引能加速它，**且不改變比對語意**。
--
-- `IF NOT EXISTS`：本地與 CI 是 superuser，正式環境的資料庫使用者可能沒有
-- 建立 extension 的權限。屆時請 DBA 先建好，這支 migration 仍然要能跑過。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 索引同時宣告在 schema.prisma（帶 map 指定名稱）——只寫在這裡的話，
-- Prisma 會把「DB 有、schema 沒有」當成 drift，下次 migrate dev 會產生一支刪掉它的 migration
CREATE INDEX "idx_users_email_trgm" ON "users" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "idx_users_display_name_trgm" ON "users" USING GIN ("display_name" gin_trgm_ops);
