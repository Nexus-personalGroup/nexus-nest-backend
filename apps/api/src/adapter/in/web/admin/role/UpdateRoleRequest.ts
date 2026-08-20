import { z } from 'zod';

const permissionCodeRegex = /^[A-Z_]+:[A-Z_]+:(VIEW|EDIT)$/;

export const updateRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '角色名稱至少 1 字元')
    .max(100, '角色名稱最多 100 字元')
    .optional(),
  permissionCodes: z
    .array(z.string().regex(permissionCodeRegex, 'permissionCode 格式不合法'))
    .optional(),
  status: z.boolean().optional(),
});

export type UpdateRoleRequest = z.infer<typeof updateRoleSchema>;
