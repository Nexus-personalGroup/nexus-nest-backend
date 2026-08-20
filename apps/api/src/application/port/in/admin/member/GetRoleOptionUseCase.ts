import { RoleOptionItem } from './ListRoleOptionsUseCase';

export const GET_ROLE_OPTION_USE_CASE = 'GET_ROLE_OPTION_USE_CASE';

export interface GetRoleOptionUseCase {
  /**
   * 單筆角色選項查詢（fallback 給前端「編輯帶入 roleId 不在第一頁」場景）
   * @throws RoleNotFoundException 角色不存在 / 停用 / 軟刪除
   */
  execute(id: string): Promise<RoleOptionItem>;
}
