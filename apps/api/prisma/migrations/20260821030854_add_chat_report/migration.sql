-- CreateEnum
CREATE TYPE "chat_report_reason" AS ENUM ('HARASSMENT', 'SPAM', 'INAPPROPRIATE', 'OTHER');

-- CreateEnum
CREATE TYPE "chat_report_status" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "chat_audit_action" ADD VALUE 'REPORT_SUBMITTED';

-- CreateTable
CREATE TABLE "chat_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "target_message_id" TEXT NOT NULL,
    "target_member_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "reason" "chat_report_reason" NOT NULL,
    "description" VARCHAR(500),
    "content_snapshot" TEXT NOT NULL,
    "status" "chat_report_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_chat_reports_status_time" ON "chat_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_chat_reports_target_member" ON "chat_reports"("target_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_chat_reports_reporter_message" ON "chat_reports"("reporter_id", "target_message_id");

-- ============================================================================
-- 欄位描述
-- ----------------------------------------------------------------------------
-- 來源是 schema.prisma 的 `///` 註解；Prisma 不會產生 COMMENT ON，故手動維護。
-- 產生方式：pnpm --filter @app/api gen:comments
-- ============================================================================

COMMENT ON TABLE "chat_reports" IS '訊息檢舉

只能檢舉訊息，不能直接檢舉使用者或房間：訊息已帶著發送者與房間，
「被檢舉者是誰」推得出來；反過來推不回去。「這個人持續騷擾」要造多筆檢舉，
而多筆指向同一個人的檢舉本身就是訊號';

COMMENT ON COLUMN "chat_reports"."reporter_id" IS '提出檢舉的成員 ID';

COMMENT ON COLUMN "chat_reports"."target_message_id" IS '被檢舉的訊息。不建外鍵：訊息日後若因保留期限被清理，檢舉仍須可審閱';

COMMENT ON COLUMN "chat_reports"."target_member_id" IS '被檢舉訊息的發送者。由訊息推導而來，存下來是為了「這個人被檢舉幾次」的查詢';

COMMENT ON COLUMN "chat_reports"."description" IS '檢舉人的補充說明，上限 500 字';

COMMENT ON COLUMN "chat_reports"."content_snapshot" IS '被檢舉訊息的內容快照

**這裡刻意違反「稽核不複製內容」的原則。** 稽核紀錄是行為的索引、內容隨時可取；
但檢舉指向「當下那句話」，而它在審閱前可能已被撤回或因保留期限被清理。
沒有快照的話，管理員會看到一則空訊息，而檢舉人明明看到了東西——
那會讓整個檢舉機制失去可信度。

代價是這是第二份內容副本，因此它**適用與訊息本體相同的「不外流」規則**：
只給後台的 RBAC 路徑，任何前台端點都不得回傳它';
