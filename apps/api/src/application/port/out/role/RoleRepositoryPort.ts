export const ROLE_REPOSITORY_PORT = 'ROLE_REPOSITORY_PORT';

export interface ListRolesParams {
  page: number;
  limit: number;
  name?: string;
  /** 啟用狀態過濾；undefined 表示不過濾 */
  status?: boolean;
}

export interface ListRolesPage {
  data: RoleRecord[];
  total: number;
}

export interface RoleRecord {
  id: string;
  name: string;
  status: boolean;
  isDefault: boolean;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleRepositoryPort {
  listRoles(params: ListRolesParams): Promise<ListRolesPage>;
  findById(id: string): Promise<RoleRecord | null>;
  findByName(name: string): Promise<RoleRecord | null>;
  create(data: { name: string }): Promise<RoleRecord>;
  /**
   * 原子性地建立 Role 並指派權限（單一 transaction）
   * @param name - Role 名稱
   * @param permissionCodes - 要指派的 permission codes
   */
  createWithPermissions(
    name: string,
    permissionCodes: string[],
  ): Promise<RoleRecord>;
  updateWithPermissions(
    id: string,
    name: string | undefined,
    permissionCodes: string[] | undefined,
    status?: boolean,
  ): Promise<void>;
  softDelete(id: string): Promise<void>;
  countMembers(id: string): Promise<number>;
}
