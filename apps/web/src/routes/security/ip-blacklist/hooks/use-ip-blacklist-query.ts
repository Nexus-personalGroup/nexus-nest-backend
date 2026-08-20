import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';

type IpBlacklistQueryParams = {
  page?: number;
  limit?: number;
  search?: string;
};

type ApiQuery = NonNullable<
  paths['/security/ip-blacklist']['get']['parameters']['query']
>;

export const useIpBlacklistQuery = (params: IpBlacklistQueryParams) => {
  const query: ApiQuery = {};
  if (params.page) query.page = params.page;
  if (params.limit) query.limit = params.limit;
  if (params.search) query.search = params.search;

  return useApiQuery('GET', '/security/ip-blacklist', {
    params: { query },
  });
};
