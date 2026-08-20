import { z } from 'zod';

export const listMyRoomsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export type ListMyRoomsQuery = z.infer<typeof listMyRoomsQuerySchema>;
