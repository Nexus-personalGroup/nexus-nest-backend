import { useCallback, useRef } from 'react';

/**
 * 「跳過 mount 首次」的微抽象：回傳一個函式，第一次呼叫回 true（並消費掉），之後永遠回 false。
 * 給「搜尋輸入 debounce 完才通知父層 → 但不希望進場就 push 一次 URL」的場景用：
 *
 * ```tsx
 * const consumeFirstRun = useIsFirstRun()
 * useEffect(() => {
 *   if (consumeFirstRun()) return
 *   onSearch(debouncedValue)
 * }, [debouncedValue, onSearch, consumeFirstRun])
 * ```
 *
 * 回傳函式必須用 useCallback 包，否則進到呼叫端的 useEffect deps 會每次 render 都是新參考
 * → effect 每 render 都跑 → 若 effect 內呼叫會改 URL 的 setter 就陷無限迴圈。
 * 之所以做這個小 helper 而不直接抽整個 useEffect：React 19 / Compiler 對「dynamic deps array」
 * 的 abstraction 有嚴格 lint，抽 useEffect 本體會被擋；只抽 ref 概念就能繞過
 */
export const useIsFirstRun = (): (() => boolean) => {
  const ref = useRef(true);
  return useCallback(() => {
    if (ref.current) {
      ref.current = false;
      return true;
    }
    return false;
  }, []);
};
