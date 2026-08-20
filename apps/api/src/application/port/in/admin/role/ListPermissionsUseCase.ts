export const LIST_PERMISSIONS_USE_CASE = 'LIST_PERMISSIONS_USE_CASE';

export interface PermissionListItem {
  permissionCode: string;
  name: string;
  platform: string;
  module: string;
  action: string;
}

export interface ListPermissionsUseCase {
  execute(): Promise<PermissionListItem[]>;
}
