import { z } from 'zod';

// 與後端 createMemberSchema 對齊（email / member / password 8-30 / roleId uuid / status default true）
export const createMemberFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, '請輸入 Email')
    .email('Email 格式不正確')
    .max(255, 'Email 最多 255 字元'),
  member: z.string().trim().min(1, '請輸入名稱').max(100, '名稱最多 100 字元'),
  password: z.string().min(8, '密碼至少 8 字元').max(30, '密碼最多 30 字元'),
  roleId: z.string().uuid('請選擇角色'),
  status: z.boolean(),
});

export type CreateMemberForm = z.infer<typeof createMemberFormSchema>;

// 編輯 schema：密碼接受空字串（送 PATCH 時剝掉）或合法 8-30 字元；
// 不用 .optional() 是因為前端 form value 統一為 string，方便和 createMemberFormSchema 共用 input type
export const updateMemberFormSchema = z.object({
  email: createMemberFormSchema.shape.email,
  member: createMemberFormSchema.shape.member,
  password: z.union([
    z.literal(''),
    z.string().min(8, '密碼至少 8 字元').max(30, '密碼最多 30 字元'),
  ]),
  roleId: createMemberFormSchema.shape.roleId,
  status: createMemberFormSchema.shape.status,
});

export type UpdateMemberForm = z.infer<typeof updateMemberFormSchema>;
