import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiMutation } from '@/api/client';

/**
 * 停權 / 解除 / 強制登出三個處置。
 *
 * 成功後同時 invalidate 列表與詳情：停權會改變詳情頁的狀態與可用動作，
 * 不 invalidate 的話畫面要手動重整才會反映（而管理員多半會以為沒生效再按一次）。
 *
 * **強制登出的提示文案刻意說明「帳號仍可使用」**——它與停權在畫面上很像，
 * 而唯一能讓人當場分辨的就是這句話。
 */
export const useFrontUserMutations = () => {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['GET', '/front-users'] });
    void queryClient.invalidateQueries({
      queryKey: ['GET', '/front-users/{userId}'],
    });
  };

  const suspend = useApiMutation('POST', '/front-users/{userId}/suspend', {
    onSuccess: () => {
      toast.success('已停權，該會員的連線已中斷');
      invalidate();
    },
    onError: (err) => {
      toast.error(err.message || '停權失敗');
    },
  });

  const reinstate = useApiMutation('POST', '/front-users/{userId}/reinstate', {
    onSuccess: () => {
      toast.success('已解除停權，該會員重新登入即可使用');
      invalidate();
    },
    onError: (err) => {
      toast.error(err.message || '解除失敗');
    },
  });

  const forceLogout = useApiMutation(
    'POST',
    '/front-users/{userId}/force-logout',
    {
      onSuccess: () => {
        toast.success('已登出所有裝置。帳號仍可使用，該會員重新登入即可');
        invalidate();
      },
      onError: (err) => {
        toast.error(err.message || '強制登出失敗');
      },
    },
  );

  return { suspend, reinstate, forceLogout };
};
