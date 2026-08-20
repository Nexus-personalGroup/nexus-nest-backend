import { useCallback } from 'react';

import {
  useListUrlState,
  type ListUrlState,
  type ListUrlStateActions,
} from '@/lib/use-list-url-state';
import { parseStatusParam, type StatusFilter } from '@/lib/status-filter';

type SearchKey = 'name' | 'email';

/**
 * 會員列表頁 URL state：薄薄 wrap `useListUrlState`，
 * 把 status 從 raw string 轉成 StatusFilter type
 */
export const useMembersUrlState = () => {
  const core = useListUrlState<SearchKey>({
    searchKeys: ['name', 'email'],
    extraKeys: ['status'],
  });

  const status = parseStatusParam(core.extras.status ?? null);

  // destructure 後再放 dep — 直接放 [core] 會每 render 失效（core object 不 stable），
  // 觸發呼叫端 SearchBar useEffect 無限迴圈
  const { setSearches: coreSetSearches, setExtra: coreSetExtra } = core;
  const setSearch = useCallback(
    (name: string, email: string) => coreSetSearches({ name, email }),
    [coreSetSearches],
  );
  const setStatus = useCallback(
    (next: StatusFilter) => coreSetExtra('status', next),
    [coreSetExtra],
  );

  return {
    page: core.page,
    limit: core.limit,
    name: core.searches.name,
    email: core.searches.email,
    status,
    edit: core.edit,
    view: core.view,
    setPage: core.setPage,
    setLimit: core.setLimit,
    setSearch,
    setStatus,
    openEdit: core.openEdit,
    closeEdit: core.closeEdit,
    openView: core.openView,
    closeView: core.closeView,
  };
};

// 保留型別 export 給呼叫端 import
export type MembersUrlState = ReturnType<typeof useMembersUrlState>;
// 預留：未來 list state 模組想要 generic core 時直接重 export
export type { ListUrlState, ListUrlStateActions };
