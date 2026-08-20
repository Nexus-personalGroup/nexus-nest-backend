import { z } from 'zod';

/**
 * 單則訊息的內容長度上限。
 *
 * 不進環境變數：它是協定的一部分（客戶端要據此在送出前擋下並提示），
 * 而不是需要依環境調整的旋鈕。真要改的時候連同 spec 一起改。
 */
export const MAX_MESSAGE_LENGTH = 4_000;

export const sendMessageSchema = z.object({
  roomId: z.uuid(),
  /**
   * 客戶端在首次送出前產生、重試時沿用的識別碼。
   *
   * 限制格式與長度是因為它會進 DB 的唯一索引——不設限的話，
   * 客戶端可以用超長字串把索引撐大，而那不是任何人會主動發現的問題。
   */
  clientMessageId: z.uuid(),
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export type SendMessageRequest = z.infer<typeof sendMessageSchema>;
