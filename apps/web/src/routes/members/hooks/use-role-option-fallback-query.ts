import { useApiQuery } from '@/api/client';

/**
 * 編輯模式時若初值的 roleId 不在第一頁，並列 fetch 該角色當作 fallback option，
 * 讓 Combobox 仍能顯示既有角色名稱與 isDefault 狀態
 * @param id 編輯中的 roleId；undefined 時 hook 不發 request
 */
export const useRoleOptionFallbackQuery = (id: string | undefined) => {
  return useApiQuery(
    'GET',
    '/members/role/options/{id}',
    { params: { path: { id: id ?? '' } } },
    {
      enabled: Boolean(id),
      // 角色資訊變化頻率低；fallback 結果可緩存較久
      staleTime: 10 * 60 * 1000,
      // 404（角色已停用）不重試，讓 UI 立刻顯示 fallback
      retry: false,
    },
  );
};
