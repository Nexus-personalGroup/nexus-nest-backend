import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';

type IpWhitelistQueryParams = {
  page?: number;
  limit?: number;
  search?: string;
};

type ApiQuery = NonNullable<
  paths['/security/ip-whitelist']['get']['parameters']['query']
>;

/**
 * 取 IP 白名單列表。空字串搜尋參數自動剝掉
 */
export const useIpWhitelistQuery = (params: IpWhitelistQueryParams) => {
  const query: ApiQuery = {};
  if (params.page) query.page = params.page;
  if (params.limit) query.limit = params.limit;
  if (params.search) query.search = params.search;

  return useApiQuery('GET', '/security/ip-whitelist', {
    params: { query },
  });
};
