import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';
import { statusFilterToBoolean, type StatusFilter } from '@/lib/status-filter';

type RolesQueryParams = {
  page?: number;
  limit?: number;
  name?: string;
  status?: StatusFilter;
};

// 從 generated schema 推導，後端 query 加欄位會自動跟著動
type ApiQuery = NonNullable<paths['/roles']['get']['parameters']['query']>;

/**
 * 取角色列表。空字串的 name 要剝掉，否則後端會當「找空字串」處理；
 * status 字串轉 boolean 對應後端 enum query
 */
export const useRolesQuery = (params: RolesQueryParams) => {
  const query: ApiQuery = {};
  if (params.page) query.page = params.page;
  if (params.limit) query.limit = params.limit;
  if (params.name) query.name = params.name;
  const status = statusFilterToBoolean(params.status);
  if (status !== undefined) query.status = status;

  return useApiQuery('GET', '/roles', { params: { query } });
};
