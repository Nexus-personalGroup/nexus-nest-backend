import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiMutation } from '@/api/client';

/**
 * IP 白名單的 create / update / remove mutation。
 * 成功時 invalidate `['GET', '/security/ip-whitelist']` 讓列表重抓；
 * 失敗 toast 顯示後端 message
 */
export const useIpWhitelistMutations = () => {
  const queryClient = useQueryClient();
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: ['GET', '/security/ip-whitelist'],
    });

  const create = useApiMutation('POST', '/security/ip-whitelist', {
    onSuccess: () => {
      toast.success('白名單已新增');
      void invalidateList();
    },
    onError: (err) => {
      toast.error(err.message || '新增失敗');
    },
  });

  const update = useApiMutation('PATCH', '/security/ip-whitelist/{id}', {
    onSuccess: () => {
      toast.success('白名單已更新');
      void invalidateList();
    },
    onError: (err) => {
      toast.error(err.message || '更新失敗');
    },
  });

  const remove = useApiMutation('DELETE', '/security/ip-whitelist/{id}', {
    onSuccess: () => {
      toast.success('白名單已刪除');
      void invalidateList();
    },
    onError: (err) => {
      toast.error(err.message || '刪除失敗');
    },
  });

  return { create, update, remove };
};
