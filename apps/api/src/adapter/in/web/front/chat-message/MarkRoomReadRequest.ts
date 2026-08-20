import { z } from 'zod';

export const markRoomReadSchema = z.object({
  /** 讀到哪一則。只增不減，比目前小的值會被當成無操作 */
  lastReadSeq: z.coerce.number().int().positive(),
});

export type MarkRoomReadRequest = z.infer<typeof markRoomReadSchema>;
