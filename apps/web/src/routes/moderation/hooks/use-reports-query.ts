import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';
import type { ReportStatus } from '../lib/moderation-display';

type ApiQuery = NonNullable<
  paths['/moderation/reports']['get']['parameters']['query']
>;

/** 檢舉佇列的資料形狀，由 generated schema 推導 */
export type ReportsData = NonNullable<
  paths['/moderation/reports']['get']['responses'][200]['content']['application/json']['data']
>;

export type ReportRow = ReportsData['list'][number];

/**
 * 取檢舉佇列
 *
 * @param params - 分頁與狀態篩選
 */
export const useReportsQuery = (params: {
  page: number;
  limit: number;
  status: ReportStatus;
}) => {
  const query: ApiQuery = {
    page: params.page,
    limit: params.limit,
    status: params.status,
  };

  return useApiQuery('GET', '/moderation/reports', { params: { query } });
};
