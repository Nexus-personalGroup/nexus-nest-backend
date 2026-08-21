import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiMutation } from '@/api/client';

/**
 * 審閱的五個處置 mutation。
 *
 * **全部不做 optimistic update。** 會員列表切換啟用狀態用 optimistic 是合理的
 * （切錯了自己再切回來），但移除訊息與停權是對真人有實質影響的動作，
 * 而 optimistic 的本質是「先假設成功」——假設錯誤時使用者已經看到成功的畫面了。
 * 每個動作都是：確認 → 執行 → 成功後 invalidate 重查。
 */
export const useModerationMutations = () => {
  const queryClient = useQueryClient();

  /**
   * 處置成功後重查詳情與佇列。
   *
   * queryKey 是 `['GET', path, init]`，這裡只給前兩格靠 React Query 的前綴比對——
   * 帶 `reportId` 反而比不中，因為第三格是整個 request init 物件。
   *
   * **重查詳情會多留一筆 `REPORT_VIEWED` 稽核**，這是知情的取捨：
   * 處置後畫面會再次顯示內容快照，所以那確實是一次「查看」。
   * 替代方案是用本地狀態推測新的移除時間，但 204 沒有回應主體——
   * 我們得自己編一個時間戳顯示成「已於 X 被移除」，那是在畫面上說謊。
   */
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ['GET', '/moderation/reports/{reportId}'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['GET', '/moderation/reports'],
    });
  };

  const withFeedback = (success: string, failure: string) => ({
    onSuccess: () => {
      toast.success(success);
      refresh();
    },
    onError: (err: Error) => {
      toast.error(err.message || failure);
    },
  });

  return {
    removeMessage: useApiMutation(
      'DELETE',
      '/moderation/messages/{messageId}',
      withFeedback('訊息已移除', '移除失敗'),
    ),
    restoreMessage: useApiMutation(
      'POST',
      '/moderation/messages/{messageId}/restore',
      withFeedback('訊息已還原', '還原失敗'),
    ),
    suspendMember: useApiMutation(
      'POST',
      '/moderation/members/{memberId}/suspend',
      withFeedback('成員已停權', '停權失敗'),
    ),
    reinstateMember: useApiMutation(
      'POST',
      '/moderation/members/{memberId}/reinstate',
      withFeedback('已解除停權', '解除停權失敗'),
    ),
    reviewReport: useApiMutation(
      'PATCH',
      '/moderation/reports/{reportId}',
      withFeedback('已更新判定', '判定失敗'),
    ),
  };
};
