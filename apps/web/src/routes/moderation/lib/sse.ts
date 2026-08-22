/**
 * 從串流文字中切出完整的 SSE 事件。
 *
 * SSE 的一筆事件以空行（`\n\n`）結束。**串流的切割點與事件邊界無關**——
 * 一個 chunk 可能含好幾筆，也可能把一筆切成兩半。這支函式因此回傳
 * 「切得出來的完整事件」與「剩下的半截」，由呼叫端把後者接到下一個 chunk 前面。
 *
 * 忘記處理半截是串流解析最常見的錯，而它在本機測試時幾乎不會出現
 * （小訊息通常一個 chunk 就送完），只在正式環境偶爾丟資料。
 *
 * @param buffer - 目前累積的文字
 * @returns `events` 為完整事件的 data 內容；`rest` 為尚未完成的殘餘
 */
export const parseSseBuffer = (
  buffer: string,
): { events: string[]; rest: string } => {
  const parts = buffer.split('\n\n');
  // 最後一段沒有以空行結尾，代表它還沒收完
  const rest = parts.pop() ?? '';

  const events = parts
    .map((block) =>
      block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        // 規格允許 `data:` 後有一個空白，兩種寫法都要吃
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n'),
    )
    .filter((data) => data.length > 0);

  return { events, rest };
};

/**
 * 重連的退避延遲（毫秒）。
 *
 * 立刻重連在伺服器重啟期間會變成密集重試，而那正是伺服器最脆弱的時刻。
 * 指數退避並設上限——上限的用意是「伺服器回來之後不要等太久」。
 *
 * @param attempt - 第幾次重試（從 1 起算）
 * @returns 這一次該等多久
 */
export const backoffDelayMs = (attempt: number): number =>
  Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 30_000);
