export interface MemberContextData {
  id: string;
  email: string;
  /** 角色顯示名（role.name，如「管理者」），給 UI 展示用 */
  roleName: string;
  /** 角色代碼（role.role_code，如 SUPERADMIN），給 Guard / 權限判斷用 */
  roleCode: string;
  permissions: string[];
  /** 帳號啟用狀態（false = 停用，Guard 拒絕請求） */
  status: boolean;
  /** token 版本；refresh 重用偵測時 +1，使該使用者所有舊 token 失效 */
  tokenVersion?: number;
  /** 最後一次更換密碼的時間（用於密碼定期更換檢查） */
  lastPasswordChange?: Date | null;
}

export const LOAD_MEMBER_CONTEXT_PORT = 'LOAD_MEMBER_CONTEXT_PORT';

export interface LoadMemberContextPort {
  loadMemberContext(memberId: string): Promise<MemberContextData | null>;
}
