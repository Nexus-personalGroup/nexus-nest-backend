-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "retracted_at" TIMESTAMPTZ(3),
ADD COLUMN     "retracted_by" TEXT;

-- ============================================================================
-- 欄位描述
-- ----------------------------------------------------------------------------
-- 來源是 schema.prisma 的 `///` 註解。Prisma 只會把它們放進 Client 的 JSDoc，
-- 不會產生 COMMENT ON，因此這段是手動維護的——改了 `///` 就要一起更新這裡。
-- content 一併重下：撤回的語意讓它的描述有實質變化，不是重複。
-- 產生方式：pnpm --filter @app/api gen:comments
-- ============================================================================

COMMENT ON COLUMN "chat_messages"."content" IS '訊息內容。目前只有純文字；日後的附件訊息會加 messageType 欄位，本欄不需改為可空

**撤回不會清空本欄**：內容保留供 M3 的檢舉調查（騷擾者送完立即撤回是最典型的
行為，清掉等於提供一鍵銷毀證據），但任何前台路徑都不得回傳它。
遮蔽只寫在 repository 的投影函式一處，並有守則限制訊息表只能有一個查詢入口';

COMMENT ON COLUMN "chat_messages"."retracted_at" IS '撤回時間；null 代表未撤回

**這一列永遠不會被刪除。** 刪掉會讓 seq 出現洞，而補齊的客戶端無法區分
「這個號碼被撤回了」與「我漏收了」——後者會讓它反覆嘗試補齊同一段區間';

COMMENT ON COLUMN "chat_messages"."retracted_by" IS '執行撤回的成員 ID。目前僅限發送者本人，欄位存在是為了 M3 的檢舉調查
（日後若開放後台管理員移除訊息，這裡才分得出是誰的動作）';
