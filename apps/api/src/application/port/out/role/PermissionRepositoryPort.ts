export const PERMISSION_REPOSITORY_PORT = 'PERMISSION_REPOSITORY_PORT';

export interface PermissionRecord {
  permissionCode: string;
  name: string;
  platform: string;
  module: string;
  action: string;
}

export interface PermissionRepositoryPort {
  findAll(): Promise<PermissionRecord[]>;
  findByCodes(codes: string[]): Promise<PermissionRecord[]>;
  getPermissionsByRoleId(roleId: string): Promise<string[]>;
  replacePermissions(roleId: string, codes: string[]): Promise<void>;
}
