import { useEffect, useRef } from 'react';

type InfiniteQueryLike = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
};

/**
 * 把「sentinel + IntersectionObserver → fetchNextPage」樣板收斂成一個 hook。
 * 回傳一個 ref 給呼叫端附在清單底端的 element（如 `<div ref={ref} className="h-px" />`）。
 *
 * @param query  TanStack `useInfiniteQuery` 回傳值（只需 hasNextPage / isFetchingNextPage / fetchNextPage）
 * @param enabled  控制是否訂閱（如 popover 關閉時 disable）；預設 true
 */
export const useInfiniteScrollSentinel = <T extends InfiniteQueryLike>(
  query: T,
  enabled: boolean = true,
) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    if (!enabled) return;
    const target = ref.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return ref;
};
