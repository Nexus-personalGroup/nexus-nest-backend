export interface RoleOptionItem {
  id: string;
  name: string;
  /**
   * 是否可被一般帳號指派。false 時前端 select 仍顯示但 disabled。
   * 規則由後端推導（roleCode === 'SUPERADMIN' → isAssignable=false）
   */
  isAssignable: boolean;
}

export interface ListRoleOptionsQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface ListRoleOptionsMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListRoleOptionsResult {
  list: RoleOptionItem[];
  meta: ListRoleOptionsMeta;
}

export const LIST_ROLE_OPTIONS_USE_CASE = 'LIST_ROLE_OPTIONS_USE_CASE';

export interface ListRoleOptionsUseCase {
  execute(query: ListRoleOptionsQuery): Promise<ListRoleOptionsResult>;
}
