import { z } from 'zod';

export const listRoleOptionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().optional(),
});

export type ListRoleOptionsQueryDto = z.infer<
  typeof listRoleOptionsQuerySchema
>;
