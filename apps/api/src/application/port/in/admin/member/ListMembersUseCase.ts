import { PaginationMeta } from '@app/infrastructure/pagination';

export interface ListMembersQuery {
  page?: number;
  limit?: number;
  name?: string;
  email?: string;
  /** 啟用狀態過濾；undefined 表示不過濾（兩者皆回） */
  status?: boolean;
}

export interface MemberListItem {
  id: string;
  email: string;
  member: string;
  roleId: string;
  roleName: string;
  status: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface ListMembersResult {
  list: MemberListItem[];
  meta: PaginationMeta;
}

export const LIST_MEMBERS_USE_CASE = 'LIST_MEMBERS_USE_CASE';

export interface ListMembersUseCase {
  execute(query: ListMembersQuery): Promise<ListMembersResult>;
}
