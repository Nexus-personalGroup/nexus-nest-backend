import { z } from 'zod';

export const createDirectRoomSchema = z.object({
  targetMemberId: z.uuid(),
});

export type CreateDirectRoomRequest = z.infer<typeof createDirectRoomSchema>;
