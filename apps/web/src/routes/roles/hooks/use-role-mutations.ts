import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiMutation } from '@/api/client';

/**
 * Create / Update / Delete 三個 mutation 集中管理。
 * - onSuccess 統一 invalidate `['GET', '/roles']` 讓列表重抓
 * - 新增 / 編輯後另外 invalidate `['GET', '/members/role/options']`，
 *   讓會員頁角色 select 反映最新角色
 * - 另外 invalidate `['GET', '/members']`：member 列表的「角色」欄顯示角色名稱，
 *   角色改名 / status 切換後沒 invalidate 的話 member 頁要重整才會更新
 * - onError 用 sonner 顯示後端回的 message + invalidate（讓 optimistic 變動回到真實狀態）
 *
 * 注意：列上 Switch 觸發的 status 切換也走 `update`，body 只送 `{ status }`。
 * toast 文案統一用「角色已更新 / 更新失敗」，與 form 編輯共用。
 */
export const useRoleMutations = () => {
  const queryClient = useQueryClient();

  const invalidateRolesAndMembers = () => {
    void queryClient.invalidateQueries({ queryKey: ['GET', '/roles'] });
    void queryClient.invalidateQueries({
      queryKey: ['GET', '/members/role/options'],
    });
    void queryClient.invalidateQueries({ queryKey: ['GET', '/members'] });
  };

  const create = useApiMutation('POST', '/roles', {
    onSuccess: () => {
      toast.success('角色已新增');
      invalidateRolesAndMembers();
    },
    onError: (err) => {
      toast.error(err.message || '新增失敗');
    },
  });

  const update = useApiMutation('PATCH', '/roles/{id}', {
    onSuccess: () => {
      toast.success('角色已更新');
      invalidateRolesAndMembers();
    },
    onError: (err) => {
      toast.error(err.message || '更新失敗');
      // optimistic rollback：失敗後重抓 list 把 row.status 等翻回真實值
      void queryClient.invalidateQueries({ queryKey: ['GET', '/roles'] });
    },
  });

  const remove = useApiMutation('DELETE', '/roles/{id}', {
    onSuccess: () => {
      toast.success('角色已刪除');
      invalidateRolesAndMembers();
    },
    onError: (err) => {
      toast.error(err.message || '刪除失敗');
    },
  });

  return { create, update, remove };
};
