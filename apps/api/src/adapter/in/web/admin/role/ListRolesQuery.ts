import { z } from 'zod';

export const listRolesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  name: z.string().trim().optional(),
  // 用 enum 嚴格解析，避開 z.coerce.boolean() 把 'false' 視為 true 的陷阱
  status: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;
