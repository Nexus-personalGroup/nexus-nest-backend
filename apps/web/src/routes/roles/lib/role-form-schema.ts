import { z } from 'zod';

const permissionCodeRegex = /^[A-Z_]+:[A-Z_]+:(VIEW|EDIT)$/;

/**
 * 由一組 permissionCodes 推導出「EDIT 蘊含 VIEW」normalize 後的結果：
 * 若 codes 含某 module 的 EDIT 而該 module **也提供** VIEW，自動補入；最後排序、去重。
 * 提交前由 RolesPage 在組 body 之前統一呼叫做 defense in depth。
 *
 * ⚠️ **必須依後端實際提供的碼判斷，不能字串推導。**
 * 「凡 `X:Y:EDIT` 就補 `X:Y:VIEW`」看起來等價，實際上會**合成不存在的權限碼**——
 * 附件只有 `BACKEND:ATTACHMENT:EDIT`（後端刻意的：上傳與刪除都是寫入操作，
 * 附件沒有「只能看」的場景），而合成出的 `BACKEND:ATTACHMENT:VIEW`
 * 會讓整個角色存不起來（後端退「Permission code 不存在」）。
 *
 * @param codes - 表單目前的權限碼
 * @param availableCodes - 後端提供的權限碼集合；未載入時傳 undefined
 * @returns 排序去重後的權限碼
 */
export const normalizePermissionCodes = (
  codes: readonly string[],
  availableCodes?: ReadonlySet<string>,
): string[] => {
  const set = new Set<string>(codes);
  // 清單還沒載入就不補：送出使用者實際勾的內容，臆測比不補更糟——
  // 後端仍是最後一道防線
  if (!availableCodes) return Array.from(set).sort();

  for (const code of codes) {
    const match = code.match(/^([A-Z_]+):([A-Z_]+):EDIT$/);
    if (!match) continue;
    const viewCode = `${match[1]}:${match[2]}:VIEW`;
    if (availableCodes.has(viewCode)) set.add(viewCode);
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
