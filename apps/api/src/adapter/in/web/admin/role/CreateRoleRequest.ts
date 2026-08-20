import { z } from 'zod';

const permissionCodeRegex = /^[A-Z_]+:[A-Z_]+:(VIEW|EDIT)$/;

export const createRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '角色名稱必填')
    .max(100, '角色名稱最多 100 字元'),
  permissionCodes: z
    .array(z.string().regex(permissionCodeRegex, 'permissionCode 格式不合法'))
    .default([]),
});

export type CreateRoleRequest = z.infer<typeof createRoleSchema>;
