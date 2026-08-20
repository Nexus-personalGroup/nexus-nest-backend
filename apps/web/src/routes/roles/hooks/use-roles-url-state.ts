import { useCallback } from 'react';

import { useListUrlState } from '@/lib/use-list-url-state';
import { parseStatusParam, type StatusFilter } from '@/lib/status-filter';

type SearchKey = 'name';

/**
 * 角色列表頁 URL state：薄薄 wrap `useListUrlState`，加 status 轉型
 */
export const useRolesUrlState = () => {
  const core = useListUrlState<SearchKey>({
    searchKeys: ['name'],
    extraKeys: ['status'],
  });

  const status = parseStatusParam(core.extras.status ?? null);

  // destructure 後放 dep（core object 不 stable，方法本身 stable）
  const { setSearch: coreSetSearch, setExtra: coreSetExtra } = core;
  const setSearch = useCallback(
    (name: string) => coreSetSearch('name', name),
    [coreSetSearch],
  );
  const setStatus = useCallback(
    (next: StatusFilter) => coreSetExtra('status', next),
    [coreSetExtra],
  );

  return {
    page: core.page,
    limit: core.limit,
    name: core.searches.name,
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

export type RolesUrlState = ReturnType<typeof useRolesUrlState>;
