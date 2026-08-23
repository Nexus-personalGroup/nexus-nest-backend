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

  // 後台 - 檢舉審閱。VIEW 與 EDIT 分開的理由與附件相反：兩者的風險不同——
  // 查看會接觸到敏感內容（含被撤回的訊息快照），判定會改變狀態。
  // 「能看的人」與「能判的人」在真實團隊裡經常不是同一群
  BACKEND_MODERATION_VIEW: 'BACKEND:MODERATION:VIEW',
  BACKEND_MODERATION_EDIT: 'BACKEND:MODERATION:EDIT',

  // 後台 - 前台會員管理。與上面兩組都分開：ACCOUNT 管的是後台同事的帳號、
  // MODERATION 管的是檢舉內容，而這一組管的是**客戶名單**。
  // 沿用任一組都會讓一次授權變成兩件事的授權
  BACKEND_FRONT_USER_VIEW: 'BACKEND:FRONT_USER:VIEW',
  BACKEND_FRONT_USER_EDIT: 'BACKEND:FRONT_USER:EDIT',
} as const;

export type PermissionCode =
  (typeof PermissionCode)[keyof typeof PermissionCode];
