-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(50) NOT NULL,
    "avatar_url" VARCHAR(500),
    "email_verified_at" TIMESTAMPTZ(3),
    "status" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- `///` 的 schema 註解不會產生 COMMENT ON，這裡手動補上關鍵的幾個
COMMENT ON TABLE "users" IS '前台使用者。與 members 完全獨立的帳號體系——聊天領域裡的每一個 member 指的都是這裡的人';
COMMENT ON COLUMN "users"."display_name" IS '聊天裡別人看到的名字。刻意不唯一；同名靠頭像與上下文區分';
COMMENT ON COLUMN "users"."email_verified_at" IS '信箱驗證完成的時間；null 表示未驗證。未驗證是否擋登入由註冊流程決定';
COMMENT ON COLUMN "users"."token_version" IS 'JWT 失效世代。不符即視為已撤銷，是立即讓所有裝置登出的唯一機制';
COMMENT ON COLUMN "users"."last_seen_at" IS '上次活動時間（永久）。與 presence 不同：後者是「現在在不在」，存 Redis 且會消失';
