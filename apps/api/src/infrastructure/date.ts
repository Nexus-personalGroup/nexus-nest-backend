import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/zh-tw';
import { getEnv } from './validate-env';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('zh-tw');

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

/**
 * 當前應用時區（`APP_TIMEZONE`）。
 * 延後到「呼叫時」解析——避免 date.ts 於模組載入階段（早於 dotenv）就讀 env。
 */
const appTz = (): string => getEnv().APP_TIMEZONE;

/**
 * 把時間點格式化為 `APP_TIMEZONE` 的 `YYYY-MM-DD`。
 * @param d - Date / ISO 字串 / null
 * @returns 日期字串；d 為 null 回空字串
 */
export const formatDate = (d: Date | string | null): string => {
  if (!d) return '';
  return dayjs(d).tz(appTz()).format('YYYY-MM-DD');
};

/**
 * 加上月數，目標月份天數不足時夾到當月最後一天。
 *
 * 不要用原生 `setMonth`：它遇到天數不足會往後溢位——1/31 加一個月得到 3/2 或 3/1，
 * 而不是 2/28。用在「密碼到期日」這類計算上，會讓月底建立的資料到期日晚幾天。
 * dayjs 的 `add` 本身就會夾取，此處包一層是為了讓呼叫端不必知道這個差異。
 *
 * @param base - 基準時間點
 * @param months - 要加的月數
 * @returns 加上月數後的時間點
 */
export const addMonths = (base: Date | string, months: number): Date =>
  dayjs(base).add(months, 'month').toDate();

/**
 * 把年 / 月 / 日組成中文日期字串（純數字組裝，不涉時區轉換）。
 * @returns 例：`2026年01月05日`
 */
export const formatYMD = (y: number, m: number, d: number): string =>
  dayjs(new Date(y, m - 1, d)).format('YYYY年MM月DD日');

/**
 * 把時間點格式化為 `APP_TIMEZONE` 的 `YYYY-MM-DD (週幾)`。
 * @param d - Date / ISO 字串 / null
 * @returns 日期字串；d 為 null 回空字串
 */
export const formatDateWithDay = (d: Date | string | null): string => {
  if (!d) return '';
  const date = dayjs(d).tz(appTz());
  return `${date.format('YYYY-MM-DD')} (${DAY_NAMES[date.day()]})`;
};

/**
 * 把時間點格式化為 `APP_TIMEZONE` 的 `YYYY-MM-DD HH:mm`（後台時間戳顯示用）。
 * @param d - Date / ISO 字串 / null
 * @returns 日期時間字串；d 為 null 回空字串
 */
export const formatDateTime = (d: Date | string | null): string => {
  if (!d) return '';
  return dayjs(d).tz(appTz()).format('YYYY-MM-DD HH:mm');
};

/**
 * `APP_TIMEZONE` 日曆日的當地 `00:00` 對應的 UTC instant（存 / 篩「開始日」）。
 * @param day - `YYYY-MM-DD` 字串
 */
export const appDayStartUtc = (day: string): Date =>
  dayjs.tz(day, appTz()).startOf('day').toDate();

/**
 * `APP_TIMEZONE` 日曆日的當地 `23:59:59.999` 對應的 UTC instant（存 / 篩「結束日」）。
 * @param day - `YYYY-MM-DD` 字串
 */
export const appDayEndUtc = (day: string): Date =>
  dayjs.tz(day, appTz()).endOf('day').toDate();

/**
 * 把 `APP_TIMEZONE` 日曆日區間轉成 UTC instant 區間（篩選比對 UTC 欄位用）。
 * @param start - 起始日 `YYYY-MM-DD`
 * @param end - 結束日 `YYYY-MM-DD`
 * @returns `{ startUtc, endUtc }`
 */
export const rangeToUtc = (
  start: string,
  end: string,
): { startUtc: Date; endUtc: Date } => ({
  startUtc: appDayStartUtc(start),
  endUtc: appDayEndUtc(end),
});

export default dayjs;
