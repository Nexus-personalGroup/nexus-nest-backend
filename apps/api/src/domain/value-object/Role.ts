/**
 * 角色代碼（對應 roles 表的 role_code 欄位），用於 Guard / 權限判斷
 * 顯示用的角色名稱（role.name，如「管理者」）放 DB，由 controller 直接讀，不再用 enum
 */
export const RoleCode = {
  SUPERADMIN: 'SUPERADMIN',
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

/** Permission code 常數（對應 permissions 表的 permission_code 欄位）
 *  格式：{PLATFORM}:{MODULE}[:{SUB_MODULE}]:{ACTION}
 */
export const PermissionCode = {
  // 後台 - 帳號管理
  BACKEND_ACCOUNT_VIEW: 'BACKEND:ACCOUNT:VIEW',
  BACKEND_ACCOUNT_EDIT: 'BACKEND:ACCOUNT:EDIT',

  // 後台 - 角色與權限管理
  BACKEND_ROLE_VIEW: 'BACKEND:ROLE:VIEW',
  BACKEND_ROLE_EDIT: 'BACKEND:ROLE:EDIT',

  // 後台 - 附件（上傳與刪除共用一個碼：兩者都是寫入操作，附件沒有「只能看」的場景）
  BACKEND_ATTACHMENT_EDIT: 'BACKEND:ATTACHMENT:EDIT',
} as const;

export type PermissionCode =
  (typeof PermissionCode)[keyof typeof PermissionCode];
