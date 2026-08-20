import { z } from 'zod';

/**
 * IP 黑名單更新 schema：目前僅 reason 可改。
 * ipAddress / isAutoBlock 不可變；省略表示不變
 */
export const updateIpBlacklistSchema = z.object({
  reason: z.string().trim().optional(),
});

export type UpdateIpBlacklistRequest = z.infer<typeof updateIpBlacklistSchema>;
