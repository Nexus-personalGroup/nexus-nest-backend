import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';

type DetailQueryLike<TData> = {
  data: TData | undefined;
  isLoading: boolean;
  isError: boolean;
};

type UseDetailDialogParams<TData, TInitial> = {
  /** URL 上的 edit id；undefined 表示未開 edit dialog */
  editId: string | undefined;
  /** URL 上的 view id；undefined 表示未開 view dialog */
  viewId: string | undefined;
  /** 由 URL state hook 取得的關閉 callback（已 useCallback 穩定） */
  closeEdit: () => void;
  closeView: () => void;
  /** 由呼叫端建立的 useApiQuery 結果（hook 內不重複呼叫，避免重複請求） */
  query: DetailQueryLike<TData>;
  /** 從 raw data 推導 dialog 初值；建議呼叫端用 useCallback 穩定 */
  mapToInitial: (data: TData) => TInitial;
  /** 404 / 403 時的 toast 訊息 */
  errorMessage: string;
};

export type DetailDialogState<TInitial> = {
  editEnabled: boolean;
  viewEnabled: boolean;
  isLoading: boolean;
  initialValues: TInitial | undefined;
};

/**
 * 列表頁「edit / view 雙 dialog 共用單一 GET endpoint」的樣板收斂：
 * - editEnabled / viewEnabled 計算（兩者互斥，editId 優先）
 * - isError 時 toast + 關掉對應 dialog
 * - 由 raw data 算出 dialog 用的 initialValues
 *
 * detailQuery 的 useApiQuery 呼叫由呼叫端負責（要先算 detailId，hook 內不重複呼叫）
 */
export const useDetailDialog = <TData, TInitial>(
  params: UseDetailDialogParams<TData, TInitial>,
): DetailDialogState<TInitial> => {
  const {
    editId,
    viewId,
    closeEdit,
    closeView,
    query,
    mapToInitial,
    errorMessage,
  } = params;

  const editEnabled = Boolean(editId);
  const viewEnabled = Boolean(viewId) && !editEnabled;

  useEffect(() => {
    if (!query.isError) return;
    toast.error(errorMessage);
    if (editEnabled) closeEdit();
    if (viewEnabled) closeView();
  }, [
    query.isError,
    editEnabled,
    viewEnabled,
    closeEdit,
    closeView,
    errorMessage,
  ]);

  const initialValues = useMemo(
    () => (query.data ? mapToInitial(query.data) : undefined),
    [query.data, mapToInitial],
  );

  return {
    editEnabled,
    viewEnabled,
    isLoading: query.isLoading,
    initialValues,
  };
};
