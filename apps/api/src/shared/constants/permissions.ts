import { PermissionCode } from '../../domain/value-object/Role';

/**
 * 拆解權限碼結構：格式 `{PLATFORM}:{MODULE}[:{SUB_MODULE}]:{ACTION}`。
 * 4 段含 subModule，3 段則 subModule 為 null —— platform/module/action 一律由 code 衍生，不手寫。
 */
export const parsePermissionCode = (
  code: string,
): {
  platform: string;
  module: string;
  subModule: string | null;
  action: string;
} => {
  const parts = code.split(':');
  if (parts.length >= 4) {
    return {
      platform: parts[0],
      module: parts[1],
      subModule: parts[2],
      action: parts[3],
    };
  }
  return {
    platform: parts[0],
    module: parts[1],
    subModule: null,
    action: parts[2],
  };
};

/**
 * 權限目錄（單一真相）：`code` 引用 `PermissionCode`（不重寫字面值），附後台顯示名。
 * seed 與其他需要「完整權限清單」的地方一律由此衍生；platform/module/action 用 parsePermissionCode 拆。
 */
export const PERMISSION_CATALOG: ReadonlyArray<{
  code: PermissionCode;
  name: string;
}> = [
  { code: PermissionCode.BACKEND_ACCOUNT_VIEW, name: '後台-管理者帳號-檢視' },
  { code: PermissionCode.BACKEND_ACCOUNT_EDIT, name: '後台-管理者帳號-編輯' },
  { code: PermissionCode.BACKEND_ROLE_VIEW, name: '後台-角色管理-檢視' },
  { code: PermissionCode.BACKEND_ROLE_EDIT, name: '後台-角色管理-編輯' },
  { code: PermissionCode.BACKEND_ATTACHMENT_EDIT, name: '後台-附件-編輯' },
  // VIEW 與 EDIT 的名稱**刻意不對稱**：VIEW 是營運總覽 / 檢舉審閱 / 聊天室
  // 三個頁面共同的門檻，只寫「檢舉審閱」會讓想給人看營運總覽的人以為勾錯了；
  // EDIT 則真的只做檢舉的處置與判定，跟著改成「聊天管理-編輯」會反過來高估它，
  // 讀的人會以為它能改聊天室或營運資料。不對稱本身在說「EDIT 比 VIEW 窄」
  { code: PermissionCode.BACKEND_MODERATION_VIEW, name: '後台-聊天管理-檢視' },
  { code: PermissionCode.BACKEND_MODERATION_EDIT, name: '後台-檢舉審閱-判定' },
  { code: PermissionCode.BACKEND_FRONT_USER_VIEW, name: '後台-會員管理-檢視' },
  { code: PermissionCode.BACKEND_FRONT_USER_EDIT, name: '後台-會員管理-編輯' },
];

/** 所有權限碼（衍生自目錄），供需要靜態清單的驗證 / 顯示使用 */
export const ALL_PERMISSION_CODES: readonly PermissionCode[] =
  PERMISSION_CATALOG.map((p) => p.code);
