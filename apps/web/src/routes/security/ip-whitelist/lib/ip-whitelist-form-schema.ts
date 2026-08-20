import { z } from 'zod';

/**
 * IP 白名單表單 schema：IP + description（後端 update 只允許改 description，但前端
 * create / edit 共用同一 form value 形狀，IP 在 edit / view 由 dialog 內部 disable）
 */
export const ipWhitelistFormSchema = z.object({
  ip: z.string().trim().min(1, '請輸入 IP 位址').max(45, 'IP 最多 45 字元'),
  description: z.string().trim().max(255, '備註最多 255 字元'),
});

export type IpWhitelistForm = z.infer<typeof ipWhitelistFormSchema>;
