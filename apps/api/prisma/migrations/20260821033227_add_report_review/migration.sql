-- AlterEnum
ALTER TYPE "chat_audit_action" ADD VALUE 'REPORT_VIEWED';

-- AlterTable
ALTER TABLE "chat_reports" ADD COLUMN     "review_note" VARCHAR(500),
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "reviewed_by" TEXT;

-- ============================================================================
-- 欄位描述
-- ----------------------------------------------------------------------------
-- 來源是 schema.prisma 的 `///` 註解；Prisma 不會產生 COMMENT ON，故手動維護。
-- 產生方式：pnpm --filter @app/api gen:comments
-- ============================================================================

COMMENT ON COLUMN "chat_reports"."reviewed_at" IS '審閱時間；未審閱為 null';

COMMENT ON COLUMN "chat_reports"."reviewed_by" IS '審閱的管理員 ID。不建外鍵：稽核性質的欄位要能在帳號被刪除後仍然存在';

COMMENT ON COLUMN "chat_reports"."review_note" IS '處理註記。目前是自由文字——沒有可選的處置動作，
日後有了移除訊息／停權會加 action 欄位，本欄的語意不需要改';
