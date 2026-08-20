import { z } from 'zod';

/**
 * IP 黑名單表單 schema：IP + reason（isAutoBlock 不在表單，僅系統自動加入時為 true）
 */
export const ipBlacklistFormSchema = z.object({
  ip: z.string().trim().min(1, '請輸入 IP 位址').max(45, 'IP 最多 45 字元'),
  reason: z.string().trim().max(255, '原因最多 255 字元'),
});

export type IpBlacklistForm = z.infer<typeof ipBlacklistFormSchema>;
