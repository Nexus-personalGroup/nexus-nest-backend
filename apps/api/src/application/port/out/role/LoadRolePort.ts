export const LOAD_ROLE_PORT = 'LOAD_ROLE_PORT';

export interface RoleOptionItem {
  id: string;
  name: string;
  /**
   * 是否可被一般帳號指派。
   * false 時前端 select 仍顯示但 disabled（如 roleCode='SUPERADMIN' 的系統管理者角色）。
   * 規則由後端統一推導：roleCode === 'SUPERADMIN' → isAssignable=false
   */
  isAssignable: boolean;
}

export interface ListActiveRolesParams {
  page: number;
  limit: number;
  /** 名稱模糊；trim 後若空字串視為未提供 */
  search?: string;
}

export interface ListActiveRolesResult {
  list: RoleOptionItem[];
  total: number;
}

export interface LoadRolePort {
  findDefaultRoleId(): Promise<string>;
  findRoleById(
    id: string,
  ): Promise<{ id: string; name: string; roleCode: string | null } | null>;
  /** 會員 dialog 角色 Combobox 用：分頁 + 名稱模糊搜尋 */
  listActiveRoles(
    params: ListActiveRolesParams,
  ): Promise<ListActiveRolesResult>;
  /** 編輯既有 member 但 roleId 不在第一頁時的 fallback；停用或軟刪除回 null */
  findActiveRoleOption(id: string): Promise<RoleOptionItem | null>;
}
