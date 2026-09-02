import { useCallback } from 'react';

import { useListUrlState } from '@/lib/use-list-url-state';
import type { AccountLockStatusFilter } from './use-account-locks-query';

type SearchKey = 'search' | 'status';

const isStatus = (value: string): value is AccountLockStatusFilter =>
  value === 'locked' || value === 'expired' || value === 'all';

/**
 * 帳號鎖定列表頁的 URL state。
 *
 * `status` 走 `searchKeys` 而非另一套機制：它跟搜尋一樣是「改了要回第一頁」的過濾條件。
 * 讀出來時做窄化——URL 是使用者可以亂打的，非法值一律當成未指定
 * （後端會套預設 `locked`），而不是原樣送出去換一個 400。
 */
export const useAccountLocksUrlState = () => {
  const core = useListUrlState<SearchKey>({
    searchKeys: ['search', 'status'],
  });

  const coreSetSearch = core.setSearch;
  const setSearch = useCallback(
    (search: string) => coreSetSearch('search', search),
    [coreSetSearch],
  );
  const setStatus = useCallback(
    (status: AccountLockStatusFilter) => coreSetSearch('status', status),
    [coreSetSearch],
  );

  const raw = core.searches.status;
  return {
    page: core.page,
    limit: core.limit,
    search: core.searches.search,
    status: raw && isStatus(raw) ? raw : undefined,
    setPage: core.setPage,
    setLimit: core.setLimit,
    setSearch,
    setStatus,
  };
};
