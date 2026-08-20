import { z } from 'zod';

export const listMessagesQuerySchema = z.object({
  /** 游標：回傳 seq 小於此值的訊息。省略代表從最新開始 */
  beforeSeq: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
