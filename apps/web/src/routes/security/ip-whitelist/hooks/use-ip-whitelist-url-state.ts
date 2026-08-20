import { useCallback } from 'react';

import { useListUrlState } from '@/lib/use-list-url-state';

type SearchKey = 'search';

/**
 * IP 白名單列表頁 URL state：薄薄 wrap `useListUrlState`，
 * 把 `searches.search` 攤平成 top-level `search` 對齊既有呼叫端
 */
export const useIpWhitelistUrlState = () => {
  const core = useListUrlState<SearchKey>({ searchKeys: ['search'] });

  // 不能用 [core] 當 dep — core 是新 object，會讓 setSearch 每次 render 都新參考；
  // 觸發呼叫端 SearchBar useEffect 每 render 跑 → 改 URL → 無限迴圈（Chrome navigation throttling）
  const coreSetSearch = core.setSearch;
  const setSearch = useCallback(
    (search: string) => coreSetSearch('search', search),
    [coreSetSearch],
  );

  return {
    page: core.page,
    limit: core.limit,
    search: core.searches.search,
    edit: core.edit,
    view: core.view,
    setPage: core.setPage,
    setLimit: core.setLimit,
    setSearch,
    openEdit: core.openEdit,
    closeEdit: core.closeEdit,
    openView: core.openView,
    closeView: core.closeView,
  };
};

export type IpWhitelistUrlState = ReturnType<typeof useIpWhitelistUrlState>;
