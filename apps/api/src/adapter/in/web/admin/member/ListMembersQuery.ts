import { z } from 'zod';

export const listMembersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  name: z.string().trim().optional(),
  email: z.string().trim().optional(),
  // 注意：不能用 z.coerce.boolean()，'false' 是非空字串會被 coerce 成 true；
  // 用 enum 嚴格限制 'true' / 'false' 兩值再 transform 成 boolean
  status: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
