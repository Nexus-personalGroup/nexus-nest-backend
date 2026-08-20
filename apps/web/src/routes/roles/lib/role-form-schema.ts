import { z } from 'zod';

const permissionCodeRegex = /^[A-Z_]+:[A-Z_]+:(VIEW|EDIT)$/;

/**
 * 由一組 permissionCodes 推導出「EDIT 蘊含 VIEW」normalize 後的結果：
 * 若 codes 含某 module 的 EDIT 但缺 VIEW，自動補入；最後排序、去重
 * 純字串推導（PLATFORM:MODULE:EDIT → PLATFORM:MODULE:VIEW）不需 permission 清單
 * 提交前由 RolesPage 在組 body 之前統一呼叫做 defense in depth
 */
export const normalizePermissionCodes = (
  codes: readonly string[],
): string[] => {
  const set = new Set<string>(codes);
  for (const code of codes) {
    const match = code.match(/^([A-Z_]+):([A-Z_]+):EDIT$/);
    if (match) set.add(`${match[1]}:${match[2]}:VIEW`);
  }
  return Array.from(set).sort();
};

// 與後端 createRoleSchema / updateRoleSchema 對齊
// 名稱 1-100、permissionCodes string[]、status boolean
export const roleFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '請輸入角色名稱')
    .max(100, '角色名稱最多 100 字元'),
  permissionCodes: z.array(
    z.string().regex(permissionCodeRegex, 'permissionCode 格式不合法'),
  ),
  status: z.boolean(),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;
