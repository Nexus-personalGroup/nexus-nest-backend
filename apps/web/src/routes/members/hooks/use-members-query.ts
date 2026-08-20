import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';
import { statusFilterToBoolean, type StatusFilter } from '@/lib/status-filter';

type MembersQueryParams = {
  page?: number;
  limit?: number;
  name?: string;
  email?: string;
  status?: StatusFilter;
};

// 從 generated schema 推導，後端 query 加欄位會自動跟著動
type ApiQuery = NonNullable<paths['/members']['get']['parameters']['query']>;

/**
 * 取會員列表。空字串的搜尋參數要剝掉，否則後端會當「找空字串」處理；
 * status 字串轉 boolean 對應後端 enum query
 */
export const useMembersQuery = (params: MembersQueryParams) => {
  const query: ApiQuery = {};
  if (params.page) query.page = params.page;
  if (params.limit) query.limit = params.limit;
  if (params.name) query.name = params.name;
  if (params.email) query.email = params.email;
  const status = statusFilterToBoolean(params.status);
  if (status !== undefined) query.status = status;

  return useApiQuery('GET', '/members', { params: { query } });
};
