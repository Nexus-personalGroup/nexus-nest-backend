import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';

type ApiQuery = NonNullable<
  paths['/security/locks']['get']['parameters']['query']
>;

export type AccountLockStatusFilter = NonNullable<ApiQuery['status']>;

type AccountLocksQueryParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: AccountLockStatusFilter;
};

/**
 * 取帳號鎖定列表。空字串搜尋參數自動剝掉。
 *
 * `status` 未帶時後端套用預設 `locked`——這裡不補預設值，
 * 兩邊各寫一次預設就是下一個「改了一邊沒改另一邊」的來源。
 */
export const useAccountLocksQuery = (params: AccountLocksQueryParams) => {
  const query: ApiQuery = {};
  if (params.page) query.page = params.page;
  if (params.limit) query.limit = params.limit;
  if (params.search) query.search = params.search;
  if (params.status) query.status = params.status;

  return useApiQuery('GET', '/security/locks', { params: { query } });
};
