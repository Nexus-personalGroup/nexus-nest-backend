import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiMutation } from '@/api/client';

export const useIpBlacklistMutations = () => {
  const queryClient = useQueryClient();
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: ['GET', '/security/ip-blacklist'],
    });

  const create = useApiMutation('POST', '/security/ip-blacklist', {
    onSuccess: () => {
      toast.success('黑名單已新增');
      void invalidateList();
    },
    onError: (err) => {
      toast.error(err.message || '新增失敗');
    },
  });

  const update = useApiMutation('PATCH', '/security/ip-blacklist/{id}', {
    onSuccess: () => {
      toast.success('黑名單已更新');
      void invalidateList();
    },
    onError: (err) => {
      toast.error(err.message || '更新失敗');
    },
  });

  const remove = useApiMutation('DELETE', '/security/ip-blacklist/{id}', {
    onSuccess: () => {
      toast.success('黑名單已刪除');
      void invalidateList();
    },
    onError: (err) => {
      toast.error(err.message || '刪除失敗');
    },
  });

  return { create, update, remove };
};
