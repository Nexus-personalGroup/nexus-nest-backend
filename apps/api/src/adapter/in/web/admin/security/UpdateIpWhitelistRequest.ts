import { z } from 'zod';

/**
 * IP 白名單更新 schema：目前僅 description 可改。
 * ipAddress 不可變（要改 IP 等於刪除重建）；省略表示不變
 */
export const updateIpWhitelistSchema = z.object({
  description: z.string().trim().optional(),
});

export type UpdateIpWhitelistRequest = z.infer<typeof updateIpWhitelistSchema>;
