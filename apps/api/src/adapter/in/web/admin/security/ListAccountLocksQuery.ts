import { z } from 'zod';

/**
 * 帳號鎖定列表 query schema：page / limit / search（email contains）/ status
 *
 * `status` 用 `z.enum` 而非字串：非法值要在進 service 之前就回 400，
 * 而不是被當成「未提供」而靜默套用預設——那會讓打錯字的呼叫端
 * 拿到一份看起來正常、只是內容不對的清單。
 */
export const listAccountLocksQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().trim().optional(),
  status: z.enum(['locked', 'expired', 'all']).optional(),
});

export type ListAccountLocksQuery = z.infer<typeof listAccountLocksQuerySchema>;
