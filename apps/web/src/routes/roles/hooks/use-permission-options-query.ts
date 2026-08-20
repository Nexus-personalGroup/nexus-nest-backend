import { useApiQuery } from '@/api/client';

/**
 * 取得可指派的 permission 清單，給 RoleFormDialog 的 PermissionsField 用。
 * 變化頻率低（新模組上線才會新增 permissionCode），10 分鐘 staleTime 兼顧
 * 「短期內密集新增模組 + 在後台給角色設定權限」的場景能比較快看到新 code
 */
export const usePermissionOptionsQuery = () => {
  return useApiQuery('GET', '/roles/permissions', undefined, {
    staleTime: 10 * 60 * 1000,
  });
};
