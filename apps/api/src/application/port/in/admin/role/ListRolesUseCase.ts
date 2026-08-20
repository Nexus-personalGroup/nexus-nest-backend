import { PaginationMeta } from '@app/infrastructure/pagination';

export const LIST_ROLES_USE_CASE = 'LIST_ROLES_USE_CASE';

export interface ListRolesQuery {
  page?: number;
  limit?: number;
  name?: string;
  /** 啟用狀態過濾；undefined 表示不過濾 */
  status?: boolean;
}

export interface RoleListItem {
  id: string;
  name: string;
  status: boolean;
  isDefault: boolean;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListRolesResult {
  list: RoleListItem[];
  meta: PaginationMeta;
}

export interface ListRolesUseCase {
  execute(query: ListRolesQuery): Promise<ListRolesResult>;
}
