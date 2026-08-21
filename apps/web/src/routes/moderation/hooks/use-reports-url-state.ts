import { useCallback } from 'react';

import { useListUrlState } from '@/lib/use-list-url-state';
import type { ReportStatus } from '../lib/moderation-display';

const STATUSES: ReportStatus[] = ['PENDING', 'REVIEWED', 'DISMISSED'];

/**
 * 把 URL 的 status 參數轉成合法狀態
 *
 * **預設待處理**：審閱的入口問題永遠是「還有什麼沒處理」，
 * 而不是「歷史上有哪些檢舉」。認不得的值也落回待處理——
 * 使用者手改網址不該讓畫面壞掉。
 *
 * @param raw - URL query 中的原始值
 * @returns 合法的檢舉狀態
 */
export const parseReportStatus = (
  raw: string | null | undefined,
): ReportStatus =>
  STATUSES.includes(raw as ReportStatus) ? (raw as ReportStatus) : 'PENDING';

/** 檢舉佇列的 URL state：分頁與狀態篩選同步到 query string */
export const useReportsUrlState = () => {
  const core = useListUrlState<never>({
    searchKeys: [],
    extraKeys: ['status'],
  });

  const { setExtra } = core;
  const setStatus = useCallback(
    (next: ReportStatus) => setExtra('status', next),
    [setExtra],
  );

  return {
    page: core.page,
    limit: core.limit,
    status: parseReportStatus(core.extras.status),
    setPage: core.setPage,
    setLimit: core.setLimit,
    setStatus,
  };
};
