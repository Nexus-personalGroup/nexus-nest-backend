export const GET_ROLE_USE_CASE = 'GET_ROLE_USE_CASE';

export interface RoleDetail {
  id: string;
  name: string;
  status: boolean;
  isDefault: boolean;
  permissionCodes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GetRoleUseCase {
  execute(id: string): Promise<RoleDetail>;
}
