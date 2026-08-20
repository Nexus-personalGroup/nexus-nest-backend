import { z } from 'zod';

/**
 * IP 黑白名單列表 query schema：page / limit / search（IP contains）
 */
export const listIpListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().trim().optional(),
});

export type ListIpListQuery = z.infer<typeof listIpListQuerySchema>;
