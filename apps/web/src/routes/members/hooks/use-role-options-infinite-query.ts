import type { paths } from '@app/api-client';

import { useApiInfiniteQuery } from '@/api/client';

/**
 * 從 generated schema 推 GET /members/role/options 的 200 data 形狀
 * （`{ list, meta }`，欄位 optional 由後端 contract 決定）
 */
export type RoleOptionsPage = NonNullable<
  paths['/members/role/options']['get']['responses'][200]['content']['application/json']['data']
>;

const PAGE_LIMIT = 20;
const STALE_TIME = 10 * 60 * 1000;

/**
 * 會員 dialog 角色 Combobox 的資料來源。每次 fetchNextPage 拉下一頁 20 筆，
 * search 寫入 queryKey 後 TanStack Query 自動 reset 重抓
 */
export const useRoleOptionsInfiniteQuery = (search: string) => {
  return useApiInfiniteQuery<'/members/role/options', RoleOptionsPage>(
    'GET',
    '/members/role/options',
    (pageParam) => ({
      params: {
        query: {
          page: pageParam,
          limit: PAGE_LIMIT,
          ...(search ? { search } : {}),
        },
      },
    }),
    (lastPage) => {
      const meta = lastPage?.meta;
      if (!meta) return undefined;
      const next = (meta.page ?? 1) + 1;
      return next <= (meta.totalPages ?? 1) ? next : undefined;
    },
    {
      initialPageParam: 1,
      queryKeyExtra: [search],
      staleTime: STALE_TIME,
    },
  );
};
