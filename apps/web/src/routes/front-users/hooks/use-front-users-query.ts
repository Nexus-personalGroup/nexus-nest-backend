import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';

type FrontUsersData = NonNullable<
  paths['/front-users']['get']['responses'][200]['content']['application/json']['data']
>;

export type FrontUserRow = FrontUsersData['list'][number];

export type FrontUserDetail = NonNullable<
  paths['/front-users/{userId}']['get']['responses'][200]['content']['application/json']['data']
>;

export type FrontUserFilters = {
  page: number;
  limit: number;
  email?: string;
  displayName?: string;
  /** undefined 表示不過濾——不是 false */
  status?: boolean;
  /** undefined 表示不過濾。true 對應「已驗證信箱」 */
  verified?: boolean;
};

/**
 * 取前台會員列表
 *
 * 兩個布林過濾在 query string 上是字串：後端用 `z.enum(['true','false'])`
 * 嚴格解析，送 boolean 會變成 `status=true` 這種字面值剛好也對，
 * 但明確轉成字串比較不容易在日後改動時踩到。
 *
 * @param filters - 分頁與過濾條件；undefined 的條件不帶進 query
 */
export const useFrontUsersQuery = (filters: FrontUserFilters) =>
  useApiQuery('GET', '/front-users', {
    params: {
      query: {
        page: filters.page,
        limit: filters.limit,
        ...(filters.email ? { email: filters.email } : {}),
        ...(filters.displayName ? { displayName: filters.displayName } : {}),
        ...(filters.status === undefined
          ? {}
          : { status: String(filters.status) as 'true' | 'false' }),
        ...(filters.verified === undefined
          ? {}
          : { verified: String(filters.verified) as 'true' | 'false' }),
      },
    },
  });

/**
 * 取單一前台會員的帳號面資料
 *
 * @param userId - 前台使用者 ID；空字串時不發請求
 */
export const useFrontUserDetailQuery = (userId: string) =>
  useApiQuery(
    'GET',
    '/front-users/{userId}',
    { params: { path: { userId } } },
    { enabled: Boolean(userId) },
  );
