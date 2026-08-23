import { z } from 'zod';

/**
 * 兩個布林過濾條件都不能用 `z.coerce.boolean()`——`'false'` 是非空字串，
 * 會被 coerce 成 `true`，症狀是「勾了停用卻列出全部」而且不會報錯。
 * 用 enum 嚴格限制兩個值再 transform，順帶讓 `status=yes` 這種輸入回 400。
 */
const strictBoolean = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const listFrontUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  email: z.string().trim().optional(),
  displayName: z.string().trim().optional(),
  status: strictBoolean,
  /** 信箱驗證狀態。`true` 對應 `emailVerifiedAt != null` */
  verified: strictBoolean,
});

export type ListFrontUsersQuery = z.infer<typeof listFrontUsersQuerySchema>;
