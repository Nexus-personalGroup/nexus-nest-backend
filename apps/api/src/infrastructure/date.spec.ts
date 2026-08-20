import {
  appDayEndUtc,
  appDayStartUtc,
  formatDate,
  formatDateTime,
  formatDateWithDay,
  formatYMD,
  rangeToUtc,
} from './date';

// 測試環境 APP_TIMEZONE = Asia/Taipei（test/setup-env.ts），故以 +08:00 驗證
describe('date helpers', () => {
  describe('formatDate', () => {
    it('將 Date 轉為 YYYY-MM-DD', () => {
      expect(formatDate(new Date('2026-01-15T00:00:00Z'))).toBe('2026-01-15');
    });

    it('依 APP_TIMEZONE 轉換：UTC 晚間 → 台北隔日（證明非直接取 UTC 日）', () => {
      // 2026-07-14T20:00Z = 台北 2026-07-15 04:00 → 跨日
      expect(formatDate(new Date('2026-07-14T20:00:00Z'))).toBe('2026-07-15');
    });

    it('null 回傳空字串', () => {
      expect(formatDate(null)).toBe('');
    });
  });

  describe('formatYMD', () => {
    it('轉為年月日格式', () => {
      expect(formatYMD(2026, 1, 5)).toBe('2026年01月05日');
    });
  });

  describe('formatDateWithDay', () => {
    it('回傳含星期的日期字串', () => {
      const result = formatDateWithDay(new Date('2026-01-04T00:00:00Z'));
      expect(result).toMatch(/2026-01-04 \([日一二三四五六]\)/);
    });

    it('null 回傳空字串', () => {
      expect(formatDateWithDay(null)).toBe('');
    });
  });

  describe('formatDateTime', () => {
    it('轉為 APP_TIMEZONE 的 YYYY-MM-DD HH:mm', () => {
      // 2026-07-14T08:30Z = 台北 16:30
      expect(formatDateTime(new Date('2026-07-14T08:30:00Z'))).toBe(
        '2026-07-14 16:30',
      );
    });

    it('null 回傳空字串', () => {
      expect(formatDateTime(null)).toBe('');
    });
  });

  describe('日邊界 helper（Asia/Taipei，+08:00）', () => {
    it('appDayStartUtc：台北該日 00:00 的 UTC instant', () => {
      expect(appDayStartUtc('2026-07-14').toISOString()).toBe(
        '2026-07-13T16:00:00.000Z',
      );
    });

    it('appDayEndUtc：台北該日 23:59:59.999 的 UTC instant', () => {
      expect(appDayEndUtc('2026-07-14').toISOString()).toBe(
        '2026-07-14T15:59:59.999Z',
      );
    });

    it('rangeToUtc：日區間 → UTC instant 區間', () => {
      const { startUtc, endUtc } = rangeToUtc('2026-07-01', '2026-07-31');
      expect(startUtc.toISOString()).toBe('2026-06-30T16:00:00.000Z');
      expect(endUtc.toISOString()).toBe('2026-07-31T15:59:59.999Z');
    });
  });
});
