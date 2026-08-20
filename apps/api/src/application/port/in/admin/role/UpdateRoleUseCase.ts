export const UPDATE_ROLE_USE_CASE = 'UPDATE_ROLE_USE_CASE';

export interface UpdateRoleCommand {
  id: string;
  name?: string;
  /** 省略時不變更權限；傳空陣列 `[]` 表示清空所有權限 */
  permissionCodes?: string[];
  /** 省略時不變更啟用狀態 */
  status?: boolean;
}

export interface UpdateRoleUseCase {
  execute(command: UpdateRoleCommand): Promise<void>;
}
