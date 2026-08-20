import { z } from 'zod';

/**
 * 加入 / 離開房間的 payload
 *
 * WS payload 與 HTTP request body 同屬外部輸入，適用同一套標準：
 * schema 是唯一真相，型別由 `z.infer` 推導，不手寫。
 */
export const roomMembershipSchema = z.object({
  /** 房間識別碼。必須對應真實存在的房間，成員資格由 application 層判斷 */
  roomId: z.uuid(),
});

export type RoomMembershipRequest = z.infer<typeof roomMembershipSchema>;
