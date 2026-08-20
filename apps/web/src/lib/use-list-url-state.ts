import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const parseInt = (v: string | null, fallback: number): number => {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export type ListUrlStateOptions<TSearchKey extends string> = {
  /** 字串 search 欄位的 key 清單（如 ['name', 'email']） */
  searchKeys: ReadonlyArray<TSearchKey>;
  /** 額外接受但不屬於 search 的 URL key（如 'status'）；hook 內以原始 string 回傳，由呼叫端自己 parse */
  extraKeys?: ReadonlyArray<string>;
  defaultPage?: number;
  defaultLimit?: number;
};

export type ListUrlState<TSearchKey extends string> = {
  page: number;
  limit: number;
  /** 各 search 欄位的當前值（空字串表示未填） */
  searches: Record<TSearchKey, string>;
  /** 各 extraKey 的原始 URL 值（undefined 表示 URL 沒帶） */
  extras: Record<string, string | undefined>;
  edit: string | undefined;
  /** view 與 edit 互斥；同時帶兩者時 edit 優先（state 推導端就解掉，呼叫端不必兜底） */
  view: string | undefined;
};

export type ListUrlStateActions<TSearchKey extends string> = {
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  /** 一次設多個 search 欄位（與 setExtra 共用底層 update；自動 reset page=1） */
  setSearches: (values: Partial<Record<TSearchKey, string>>) => void;
  /** 設一個 search 欄位（自動 reset page=1） */
  setSearch: (key: TSearchKey, value: string) => void;
  /** 設一個 extra key 的 URL 值；undefined 表示拿掉（自動 reset page=1） */
  setExtra: (key: string, value: string | undefined) => void;
  openEdit: (id: string) => void;
  closeEdit: () => void;
  openView: (id: string) => void;
  closeView: () => void;
};

/**
 * 列表頁 URL state 共用樣板：page / limit / search-fields / edit / view 全部同步到 query string。
 * 設計：
 * - search-fields 一律 string；非字串型別（如 status `'true' | 'false'`）走 extraKeys
 *   呼叫端自己 parse，避免泛型推導爆炸
 * - edit / view 互斥 — state 推導時 view 自動讓位給 edit（使用者手動編 URL 也不會兩個 dialog 疊）
 * - 切 search / extra / limit 一律 reset page=1（與翻頁直觀對齊）
 */
export const useListUrlState = <TSearchKey extends string>(
  options: ListUrlStateOptions<TSearchKey>,
): ListUrlState<TSearchKey> & ListUrlStateActions<TSearchKey> => {
  const {
    searchKeys,
    extraKeys = [],
    defaultPage = 1,
    defaultLimit = 10,
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();

  const editParam = searchParams.get('edit') ?? undefined;
  const searches = {} as Record<TSearchKey, string>;
  for (const key of searchKeys) {
    searches[key] = searchParams.get(key) ?? '';
  }
  const extras: Record<string, string | undefined> = {};
  for (const key of extraKeys) {
    extras[key] = searchParams.get(key) ?? undefined;
  }

  const state: ListUrlState<TSearchKey> = {
    page: parseInt(searchParams.get('page'), defaultPage),
    limit: parseInt(searchParams.get('limit'), defaultLimit),
    searches,
    extras,
    edit: editParam,
    view: editParam ? undefined : (searchParams.get('view') ?? undefined),
  };

  const update = useCallback(
    (mut: Record<string, string | number | undefined>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(mut)) {
            if (
              value === undefined ||
              value === '' ||
              (key === 'page' && value === defaultPage) ||
              (key === 'limit' && value === defaultLimit)
            ) {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, defaultPage, defaultLimit],
  );

  const setPage = useCallback((page: number) => update({ page }), [update]);
  const setLimit = useCallback(
    (limit: number) => update({ limit, page: defaultPage }),
    [update, defaultPage],
  );
  const setSearches = useCallback(
    (values: Partial<Record<TSearchKey, string>>) =>
      update({ ...values, page: defaultPage }),
    [update, defaultPage],
  );
  const setSearch = useCallback(
    (key: TSearchKey, value: string) =>
      update({ [key]: value, page: defaultPage }),
    [update, defaultPage],
  );
  const setExtra = useCallback(
    (key: string, value: string | undefined) =>
      update({ [key]: value, page: defaultPage }),
    [update, defaultPage],
  );
  // edit / view 互斥：開一個就清掉另一個
  const openEdit = useCallback(
    (id: string) => update({ edit: id, view: undefined }),
    [update],
  );
  const closeEdit = useCallback(() => update({ edit: undefined }), [update]);
  const openView = useCallback(
    (id: string) => update({ view: id, edit: undefined }),
    [update],
  );
  const closeView = useCallback(() => update({ view: undefined }), [update]);

  return {
    ...state,
    setPage,
    setLimit,
    setSearches,
    setSearch,
    setExtra,
    openEdit,
    closeEdit,
    openView,
    closeView,
  };
};
