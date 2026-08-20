import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { formatRelativeTime } from './format-relative-time';

describe('formatRelativeTime', () => {
  const NOW = new Date('2026-05-17T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('null / undefined 回傳 fallback', () => {
    expect(formatRelativeTime(null)).toBe('—');
    expect(formatRelativeTime(undefined)).toBe('—');
    expect(formatRelativeTime('')).toBe('—');
  });

  it('自訂 fallback', () => {
    expect(formatRelativeTime(null, '無')).toBe('無');
  });

  it('非合法日期回傳 fallback', () => {
    expect(formatRelativeTime('not-a-date')).toBe('—');
  });

  it('5 秒內視為剛剛', () => {
    const date = new Date(NOW.getTime() - 2_000).toISOString();
    expect(formatRelativeTime(date)).toBe('剛剛');
  });

  it('分鐘前', () => {
    const date = new Date(NOW.getTime() - 3 * 60_000).toISOString();
    expect(formatRelativeTime(date)).toContain('3');
  });

  it('小時前', () => {
    const date = new Date(NOW.getTime() - 5 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(date)).toContain('5');
  });
});
