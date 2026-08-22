import { describe, expect, it } from 'vitest';

import { backoffDelayMs, parseSseBuffer } from './sse';

describe('parseSseBuffer', () => {
  it('切出單一事件', () => {
    const { events, rest } = parseSseBuffer('data: {"a":1}\n\n');

    expect(events).toEqual(['{"a":1}']);
    expect(rest).toBe('');
  });

  it('一個 chunk 含多筆事件', () => {
    const { events } = parseSseBuffer('data: {"a":1}\n\ndata: {"a":2}\n\n');

    expect(events).toEqual(['{"a":1}', '{"a":2}']);
  });

  /**
   * **串流的切割點與事件邊界無關。**
   *
   * 忘記處理半截是串流解析最常見的錯，而它在本機幾乎不會出現
   * （小訊息通常一個 chunk 就送完），只在正式環境偶爾丟資料。
   */
  it('⭐ 一筆被切成兩個 chunk → 前半留在 rest，接上後才完整', () => {
    const first = parseSseBuffer('data: {"a":');
    expect(first.events).toEqual([]);
    expect(first.rest).toBe('data: {"a":');

    const second = parseSseBuffer(`${first.rest}1}\n\n`);
    expect(second.events).toEqual(['{"a":1}']);
    expect(second.rest).toBe('');
  });

  it('沒有空白的 `data:` 也要吃', () => {
    const { events } = parseSseBuffer('data:{"a":1}\n\n');

    expect(events).toEqual(['{"a":1}']);
  });

  it('忽略註解與其他欄位', () => {
    const { events } = parseSseBuffer(': keep-alive\nevent: ping\n\n');

    expect(events).toEqual([]);
  });

  it('空字串不產生事件', () => {
    expect(parseSseBuffer('').events).toEqual([]);
  });
});

describe('backoffDelayMs', () => {
  // 立刻重連在伺服器重啟期間會變成密集重試，而那正是它最脆弱的時刻
  it('隨重試次數指數增加', () => {
    expect(backoffDelayMs(1)).toBe(1_000);
    expect(backoffDelayMs(2)).toBe(2_000);
    expect(backoffDelayMs(3)).toBe(4_000);
  });

  // 上限的用意是「伺服器回來之後不要等太久」
  it('有上限，不會無限增長', () => {
    expect(backoffDelayMs(20)).toBe(30_000);
  });

  it('第 0 次也給得出合理的延遲', () => {
    expect(backoffDelayMs(0)).toBe(1_000);
  });
});
