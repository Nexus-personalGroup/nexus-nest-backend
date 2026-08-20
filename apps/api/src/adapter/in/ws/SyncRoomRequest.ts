import { z } from 'zod';

export const syncRoomSchema = z.object({
  roomId: z.uuid(),
  /** 客戶端最後收到的 seq；0 代表從頭開始（新加入房間或本機沒有任何紀錄） */
  lastSeq: z.coerce.number().int().min(0),
});

export type SyncRoomRequest = z.infer<typeof syncRoomSchema>;
