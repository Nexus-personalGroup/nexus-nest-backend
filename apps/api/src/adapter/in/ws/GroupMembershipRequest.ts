import { z } from 'zod';

/**
 * 加入 / 離開群組的 payload
 *
 * WS payload 與 HTTP request body 同屬外部輸入，適用同一套標準：
 * schema 是唯一真相，型別由 `z.infer` 推導，不手寫。
 */
export const groupMembershipSchema = z.object({
  /** 群組識別碼。M1 只做群組成員關係，聊天室的概念屬於 M2 */
  groupId: z.string().min(1).max(128),
});

export type GroupMembershipRequest = z.infer<typeof groupMembershipSchema>;
