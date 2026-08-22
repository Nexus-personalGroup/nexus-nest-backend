import { useEffect, useRef, useState } from 'react';
import type { paths } from '@app/api-client';

import { tokenStorage } from '@/lib/storage';
import { backoffDelayMs, parseSseBuffer } from '../lib/sse';

/** 快照的資料形狀，由 generated schema 推導 */
export type DashboardSnapshot = NonNullable<
  paths['/moderation/dashboard']['get']['responses'][200]['content']['application/json']['data']
>;

const STREAM_URL = '/api/admin/moderation/dashboard/stream';

export type DashboardStreamState = {
  snapshot: DashboardSnapshot | null;
  /** false 代表串流中斷中；此時 snapshot 是舊資料 */
  connected: boolean;
};

/**
 * 訂閱營運快照。
 *
 * **不能用原生 `EventSource`**：它無法帶自訂 header，而本專案的 token
 * 以 `Authorization: Bearer` 傳送。把 token 放 query string 是專案明文禁止的
 * （query 會進伺服器日誌、瀏覽器歷史與 `Referer`），所以只剩
 * `fetch` + `response.body.getReader()` 這條路。
 *
 * 代價是重連要自己寫——而那本來就需要自訂：`EventSource` 內建的固定間隔重連
 * 在伺服器重啟期間會變成密集重試。
 */
export const useDashboardStream = (enabled: boolean): DashboardStreamState => {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  // 用 ref 保存，避免 effect 因為它變動而重跑（重跑等於重新連線）
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = async (): Promise<void> => {
      try {
        const response = await fetch(STREAM_URL, {
          headers: { Authorization: `Bearer ${tokenStorage.get() ?? ''}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error('串流建立失敗');

        setConnected(true);
        attemptRef.current = 0;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseBuffer(buffer);
          buffer = rest;

          for (const event of events) {
            setSnapshot(JSON.parse(event) as DashboardSnapshot);
          }
        }
        throw new Error('串流中斷');
      } catch {
        if (stopped) return;
        setConnected(false);
        attemptRef.current += 1;
        // 退避後重連：立刻重試在伺服器重啟期間會變成密集重連
        retryTimer = setTimeout(
          () => void connect(),
          backoffDelayMs(attemptRef.current),
        );
      }
    };

    void connect();

    return () => {
      stopped = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled]);

  return { snapshot, connected };
};
