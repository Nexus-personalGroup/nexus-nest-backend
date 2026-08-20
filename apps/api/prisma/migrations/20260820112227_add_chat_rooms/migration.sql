-- CreateEnum
CREATE TYPE "room_type" AS ENUM ('DIRECT', 'GROUP');

-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" TEXT NOT NULL,
    "room_type" "room_type" NOT NULL,
    "name" VARCHAR(100),
    "direct_key" VARCHAR(80),
    "created_by" VARCHAR(36),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_room_members" (
    "room_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_room_members_pkey" PRIMARY KEY ("room_id","member_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_direct_key_key" ON "chat_rooms"("direct_key");

-- CreateIndex
CREATE INDEX "idx_chat_room_members_member" ON "chat_room_members"("member_id");

-- AddForeignKey
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- 欄位描述
-- ----------------------------------------------------------------------------
-- 來源是 schema.prisma 的 `///` 註解。Prisma 只會把它們放進 Client 的 JSDoc，
-- 不會產生 COMMENT ON，因此這段是手動維護的——改了 `///` 就要一起更新這裡。
-- 產生方式：pnpm --filter @app/api gen:comments
-- ============================================================================

COMMENT ON TABLE "chat_rooms" IS '聊天室。1:1 私聊與群組共用同一張表，以 roomType 區分';
COMMENT ON COLUMN "chat_rooms"."room_type" IS '房間類型：DIRECT（1:1 私聊）| GROUP（群組）';
COMMENT ON COLUMN "chat_rooms"."name" IS '群組名稱。私聊為 null——它的顯示名稱由對方決定，存下來會在對方改名時過時';
COMMENT ON COLUMN "chat_rooms"."direct_key" IS '1:1 私聊的正規化鍵：兩個成員 ID 排序後以冒號串接（`min:max`），群組為 null

**這是「同一組人只能有一個私聊房間」的唯一保證來源。** 用「先查有沒有」實作
會有競態——兩邊同時開啟對話就建出兩個房間，而症狀是訊息分裂在兩個房間，
很難察覺。Postgres 的 unique index 允許多個 null，因此群組不會互相衝突。';
COMMENT ON COLUMN "chat_rooms"."created_by" IS '建立者的成員 ID。稽核用途，不建外鍵——刪除帳號時不應被卡住';

COMMENT ON TABLE "chat_room_members" IS '房間成員關係

**不做軟刪除**：離開房間即刪除該列。軟刪除的價值在「需要還原」或「需要歷史」，
而重新加入就是建立新的關係、不需還原；歷史由稽核紀錄負責（M3）。
代價面則相反——成員關係是每次授權判斷都要查的高頻路徑，
少一個「所有查詢都要記得加」的條件是實質的簡化。';
COMMENT ON COLUMN "chat_room_members"."member_id" IS '成員 ID。不建外鍵至 members：帳號刪除的處置屬於業務決定，不該由 DB 層連動';
