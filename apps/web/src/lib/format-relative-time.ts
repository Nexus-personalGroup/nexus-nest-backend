// 用原生 Intl.RelativeTimeFormat 顯示「N 分鐘前」，不引入 dayjs 等第三方
const rtf = new Intl.RelativeTimeFormat('zh-Hant', { numeric: 'auto' });

type Unit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second';

const UNIT_SECONDS: Array<{ unit: Unit; seconds: number }> = [
  { unit: 'year', seconds: 60 * 60 * 24 * 365 },
  { unit: 'month', seconds: 60 * 60 * 24 * 30 },
  { unit: 'week', seconds: 60 * 60 * 24 * 7 },
  { unit: 'day', seconds: 60 * 60 * 24 },
  { unit: 'hour', seconds: 60 * 60 },
  { unit: 'minute', seconds: 60 },
  { unit: 'second', seconds: 1 },
];

/**
 * 把 ISO 字串或 Date 轉成相對時間，如「3 分鐘前」「剛剛」
 * @returns 相對時間字串；輸入 null / undefined / 空字串時回傳 fallback
 */
export const formatRelativeTime = (
  iso: string | Date | null | undefined,
  fallback = '—',
): string => {
  if (!iso) return fallback;

  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return fallback;

  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 5) return '剛剛';

  for (const { unit, seconds } of UNIT_SECONDS) {
    if (absSec >= seconds) {
      return rtf.format(Math.round(diffSec / seconds), unit);
    }
  }
  return rtf.format(diffSec, 'second');
};
