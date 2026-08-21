-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "chat_audit_action" ADD VALUE 'MESSAGE_REMOVED';
ALTER TYPE "chat_audit_action" ADD VALUE 'MESSAGE_RESTORED';

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "removed_at" TIMESTAMPTZ(3),
ADD COLUMN     "removed_by" TEXT;

-- ============================================================================
-- 欄位描述
-- ----------------------------------------------------------------------------
-- 來源是 schema.prisma 的 `///` 註解；Prisma 不會產生 COMMENT ON，故手動維護。
-- retracted_by 一併重下：它的描述因為移除的出現而有實質變化，不是重複。
-- 產生方式：pnpm --filter @app/api gen:comments
-- ============================================================================

COMMENT ON COLUMN "chat_messages"."retracted_by" IS '執行撤回的成員 ID。僅限發送者本人——管理員的移除走 removed_by，兩者不共用';

COMMENT ON COLUMN "chat_messages"."removed_at" IS '管理員移除的時間；null 代表未被移除

**刻意不與 retracted_at 共用。** 兩者對客戶端的語意不同：
「對方自己收回」與「被平台處理」。共用會讓發送者以為自己撤回了（他沒有），
也讓後台無法統計「被移除幾則」——而那是判斷平台治理狀況的基本指標。

兩個標記可以同時存在（撤回後仍可被移除），呈現上以移除優先——它是更強的宣告。
移除同樣是軟刪除：被移除的訊息正是最需要留下證據的那些';

COMMENT ON COLUMN "chat_messages"."removed_by" IS '執行移除的管理員 ID。不建外鍵：稽核性質的欄位要能在帳號被刪除後仍然存在';
