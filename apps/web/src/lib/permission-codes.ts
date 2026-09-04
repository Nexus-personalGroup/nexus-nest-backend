/**
 * 與後端權限目錄（`apps/api/src/domain/value-object/Role.ts`）對齊的權限碼。
 *
 * 前端引用常數而非 magic string：打錯一個字的後果是**靜默的**——
 * `BACKEND:ACCOUNT:VEIW` 會讓那個 sidebar 項目對所有人消失（含 SUPERADMIN），
 * 而 typecheck、lint、測試全綠，回報進來只會是「選單不見了」。
 *
 * **型別是第一道防線，守則是第二道**：
 * `permission-codes-sync.spec.ts` 比對本檔與後端目錄，擋住「常數本身寫錯」
 * 與「後端改名或移除」。
 *
 * 只收 `apps/web` 實際用得到的碼，不整份複製後端目錄——
 * 用不到的碼放在這裡只會讓人以為前端有對應的頁面。
 */
export const PERMISSION_CODE = {
  ACCOUNT_VIEW: 'BACKEND:ACCOUNT:VIEW',
  ROLE_VIEW: 'BACKEND:ROLE:VIEW',
  FRONT_USER_VIEW: 'BACKEND:FRONT_USER:VIEW',
  MODERATION_VIEW: 'BACKEND:MODERATION:VIEW',
} as const;

export type PermissionCode =
  (typeof PERMISSION_CODE)[keyof typeof PERMISSION_CODE];
