import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';

/** 檢舉詳情的資料形狀，由 generated schema 推導 */
export type ReportDetail = NonNullable<
  paths['/moderation/reports/{reportId}']['get']['responses'][200]['content']['application/json']['data']
>;

/**
 * 「查看一次」的定義：五分鐘內同一筆不重複請求。
 *
 * 這不是效能優化，是**稽核語意**：詳情端點每次呼叫都寫一筆 `REPORT_VIEWED`，
 * 而稽核量必須與「實際看到敏感內容的次數」對齊。沒有 staleTime 的話，
 * 切走瀏覽器分頁再切回來、或元件重掛，都會多記一筆沒有人真的看過的「查看」。
 */
const VIEW_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * 取單筆檢舉詳情
 *
 * **呼叫這支就等於在後端留下一筆稽核**，因此絕對不可以 prefetch
 * （hover 預載、可視區域預載都不行）——那會製造一堆沒有人真的看過的紀錄。
 *
 * @param reportId - 檢舉 ID；空字串時不發請求
 */
export const useReportDetailQuery = (reportId: string) =>
  useApiQuery(
    'GET',
    '/moderation/reports/{reportId}',
    { params: { path: { reportId } } },
    { enabled: Boolean(reportId), staleTime: VIEW_STALE_TIME_MS },
  );
