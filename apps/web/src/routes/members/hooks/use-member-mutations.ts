import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiMutation } from '@/api/client';

/**
 * Create / Update / Delete 三個 mutation 集中管理。
 * - 成功時 invalidate `['GET', '/members']` 讓 list 重抓
 * - 同時 invalidate `['GET', '/roles']`：角色頁的 memberCount 是依 member 計算，
 *   member CRUD 完不 invalidate 的話角色頁要重整才會反映新人數
 * - onError 統一 toast 紅字回饋（hook factory 取的 Error.message 已含後端 message）
 */
export const useMemberMutations = () => {
  const queryClient = useQueryClient();
  const invalidateMembersAndRoles = () => {
    void queryClient.invalidateQueries({ queryKey: ['GET', '/members'] });
    void queryClient.invalidateQueries({ queryKey: ['GET', '/roles'] });
  };

  const create = useApiMutation('POST', '/members', {
    onSuccess: () => {
      toast.success('會員已新增');
      invalidateMembersAndRoles();
    },
    onError: (err) => {
      toast.error(err.message || '新增失敗');
    },
  });

  const update = useApiMutation('PATCH', '/members/{id}', {
    onSuccess: () => {
      toast.success('會員已更新');
      invalidateMembersAndRoles();
    },
    onError: (err) => {
      toast.error(err.message || '更新失敗');
    },
  });

  const remove = useApiMutation('DELETE', '/members/{id}', {
    onSuccess: () => {
      toast.success('會員已刪除');
      invalidateMembersAndRoles();
    },
    onError: (err) => {
      toast.error(err.message || '刪除失敗');
    },
  });

  return { create, update, remove };
};
