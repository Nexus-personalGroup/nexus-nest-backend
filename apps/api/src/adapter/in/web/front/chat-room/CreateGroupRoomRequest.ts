import { z } from 'zod';

export const createGroupRoomSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // 上限存在的理由不是資料庫，而是「一次建立幾百人的群組」多半是誤用或濫用；
  // 真的需要大群請走另一個明確的批次流程
  memberIds: z.array(z.uuid()).min(1).max(200),
});

export type CreateGroupRoomRequest = z.infer<typeof createGroupRoomSchema>;
