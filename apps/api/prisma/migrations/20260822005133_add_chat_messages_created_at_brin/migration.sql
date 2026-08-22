-- CreateIndex
CREATE INDEX "idx_chat_messages_created_at" ON "chat_messages" USING BRIN ("created_at");
