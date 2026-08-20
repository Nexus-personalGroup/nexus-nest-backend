import { z } from 'zod';

// 全欄位 partial：只送有變動的欄位即可（例如列表上的 status switch 只送 { status }），
// 避免前端為了改一欄而回傳整列、與其他併發寫入互相覆蓋
export const updateMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .email('請輸入有效的 Email')
    .max(255, 'Email 最多 255 字元')
    .optional(),
  member: z
    .string()
    .trim()
    .min(1, '名稱為必填')
    .max(100, '名稱最多 100 字元')
    .optional(),
  password: z
    .union([
      z.string().min(8, '密碼至少 8 字元').max(30, '密碼最多 30 字元'),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  roleId: z.string().uuid('請指定有效的角色 ID').optional(),
  status: z.boolean().optional(),
});

export type UpdateMemberRequest = z.infer<typeof updateMemberSchema>;
