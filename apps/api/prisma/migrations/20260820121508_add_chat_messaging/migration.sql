-- AlterTable
ALTER TABLE "chat_rooms" ADD COLUMN     "last_seq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "client_message_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_room_reads" (
    "room_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "last_read_seq" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_room_reads_pkey" PRIMARY KEY ("room_id","member_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_chat_messages_room_seq" ON "chat_messages"("room_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "uq_chat_messages_room_client_id" ON "chat_messages"("room_id", "client_message_id");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_room_reads" ADD CONSTRAINT "chat_room_reads_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 欄位描述
-- ----------------------------------------------------------------------------
-- 來源是 schema.prisma 的 `///` 註解。Prisma 只會把它們放進 Client 的 JSDoc，
-- 不會產生 COMMENT ON，因此這段是手動維護的——改了 `///` 就要一起更新這裡。
-- 產生方式：pnpm --filter @app/api gen:comments
-- ============================================================================

COMMENT ON COLUMN "chat_rooms"."last_seq" IS '房間內已配出的最大訊息序號。寫訊息時在同一交易內 +1 並回填到訊息列

放在房間上而非用資料庫 sequence：一個房間一個 sequence 代表房間數等於 schema
物件數，建房間會變成 DDL 操作，而 DDL 不能安全地跟 DML 放進同一個交易';

COMMENT ON TABLE "chat_messages" IS '聊天訊息

順序由 seq 決定而非時間戳：兩個實例可能在同一毫秒寫入，
而不同客戶端各自依時間排序會得到不同結果。順序必須由伺服器決定並固定下來';

COMMENT ON COLUMN "chat_messages"."sender_id" IS '發送者的成員 ID。不建外鍵至 members：帳號刪除的處置屬於業務決定，不該由 DB 層連動';

COMMENT ON COLUMN "chat_messages"."content" IS '訊息內容。目前只有純文字；日後的附件訊息會加 messageType 欄位，本欄不需改為可空';

COMMENT ON COLUMN "chat_messages"."seq" IS '房間內單調遞增的序號，由 chat_rooms.last_seq 配號而來

**這是訊息順序與斷線補齊的唯一依據。** 補齊時客戶端問「seq 大於 N 的都給我」，
因此房間內必須連續——撤回訊息時只能軟刪除、保留該列，
否則序號會出現洞，客戶端無法區分「被撤回」與「我漏收了」';

COMMENT ON COLUMN "chat_messages"."client_message_id" IS '客戶端在首次送出前產生的識別碼，重試時沿用同一個值

與 room_id 的複合唯一索引是去重的唯一保證來源。用「先查有沒有」會有空窗——
重試通常在數百毫秒內、且兩次請求可能落在不同實例上，症狀是聊天室裡偶爾出現
重複訊息，而且事後無法從伺服器端修復（兩列都是合法資料，分不出哪列是重送）';

COMMENT ON TABLE "chat_room_reads" IS '每人每房間的已讀位置

只記最後讀到的 seq，不記「哪幾則已讀」——已讀是單調前進的，不需要集合。
也不存未讀數：存下來的話每寫一則訊息就要更新房間內所有成員的未讀數，
一次寫入放大成 N 次，而它可以用 room.last_seq - last_read_seq 算出來';

COMMENT ON COLUMN "chat_room_reads"."last_read_seq" IS '最後讀到的訊息序號。只增不減——客戶端往回捲不代表未讀';
