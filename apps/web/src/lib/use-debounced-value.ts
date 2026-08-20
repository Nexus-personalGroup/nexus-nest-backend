import { useEffect, useState } from 'react';

/**
 * 把 value 延遲一段時間才回傳，常用在搜尋輸入避免按鍵就送請求
 * @param value 即時輸入值
 * @param delayMs 延遲毫秒數，預設 300
 */
export const useDebouncedValue = <T>(value: T, delayMs = 300): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
};
