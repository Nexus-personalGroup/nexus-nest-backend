-- CreateEnum
CREATE TYPE "chat_audit_action" AS ENUM ('ROOM_JOINED', 'ROOM_LEFT', 'MESSAGE_RETRACTED', 'MESSAGE_RETRACT_REJECTED', 'MESSAGE_RATE_LIMITED');

-- CreateTable
CREATE TABLE "chat_audit_logs" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "action" "chat_audit_action" NOT NULL,
    "room_id" TEXT,
    "target_member_id" TEXT,
    "target_message_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_chat_audit_member_time" ON "chat_audit_logs"("member_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_chat_audit_room_time" ON "chat_audit_logs"("room_id", "created_at");

-- ============================================================================
-- 欄位描述
-- ----------------------------------------------------------------------------
-- 來源是 schema.prisma 的 `///` 註解。Prisma 只會把它們放進 Client 的 JSDoc，
-- 不會產生 COMMENT ON，因此這段是手動維護的——改了 `///` 就要一起更新這裡。
-- 產生方式：pnpm --filter @app/api gen:comments
-- ============================================================================

COMMENT ON TABLE "chat_audit_logs" IS '聊天行為稽核

**只記「證據會消失」的行為，不記每則訊息。** 判準不是「這件事重不重要」——
送出訊息已經記在 chat_messages（發送者、房間、時間、序號），再寫一筆稽核
只是把同一份中繼資料存兩次，代價是熱路徑多一次寫入與儲存翻倍。

真正沒有紀錄的是：離開房間（成員關係列被直接刪除，因此「某人曾在某房間待到某時」
目前完全不可復原）、被限流擋下、撤回被拒——這些行為過去之後不留任何痕跡';

COMMENT ON COLUMN "chat_audit_logs"."member_id" IS '執行動作的成員 ID。不建外鍵：稽核紀錄要能在帳號被刪除後仍然存在';

COMMENT ON COLUMN "chat_audit_logs"."room_id" IS '相關房間；與房間無關的動作為 null';

COMMENT ON COLUMN "chat_audit_logs"."target_member_id" IS '動作的對象成員。檢舉調查要看的是「B 對 A 做過什麼」，
沒有這個欄位的話之後要補就得回填歷史，而那補不回來';

COMMENT ON COLUMN "chat_audit_logs"."target_message_id" IS '動作的對象訊息，例如撤回或嘗試撤回的那一則';
