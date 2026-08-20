/**
 * 列表頁狀態篩選的共用型別與 helper。
 * URL 用字串（'true' / 'false' / undefined）持有，後端用 boolean，shadcn Select 用
 * sentinel 'all'。把三邊的轉換集中在一處，呼叫端不必各自重複寫
 */
export type StatusFilter = 'true' | 'false' | undefined;

/**
 * 解析 URL `?status=` 參數成 StatusFilter；不是 'true'/'false' 就視為 undefined（不過濾），
 * 對使用者亂改 URL fallthrough 不噴錯
 */
export const parseStatusParam = (v: string | null): StatusFilter => {
  if (v === 'true' || v === 'false') return v;
  return undefined;
};

/**
 * StatusFilter → 後端 query 的 boolean；undefined 代表「不送 status 欄位」（不過濾）
 */
export const statusFilterToBoolean = (v: StatusFilter): boolean | undefined => {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
};
