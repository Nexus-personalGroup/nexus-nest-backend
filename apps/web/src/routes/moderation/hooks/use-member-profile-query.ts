import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';
import type { MemberReportRole } from '../lib/moderation-display';

/** 成員概覽的資料形狀，由 generated schema 推導 */
export type MemberProfile = NonNullable<
  paths['/moderation/members/{memberId}']['get']['responses'][200]['content']['application/json']['data']
>;

type MemberReportsData = NonNullable<
  paths['/moderation/members/{memberId}/reports']['get']['responses'][200]['content']['application/json']['data']
>;

export type MemberReportRow = MemberReportsData['list'][number];

/**
 * 取成員的審閱概覽
 *
 * 與檢舉詳情不同，**這支不寫稽核**（回應不含任何訊息內容），
 * 因此不需要為了控制稽核量而設 staleTime。
 *
 * @param memberId - 成員 ID；空字串時不發請求
 */
export const useMemberProfileQuery = (memberId: string) =>
  useApiQuery(
    'GET',
    '/moderation/members/{memberId}',
    { params: { path: { memberId } } },
    { enabled: Boolean(memberId) },
  );

/**
 * 取與成員相關的檢舉
 *
 * @param memberId - 成員 ID；空字串時不發請求
 * @param role - 查詢方向
 * @param page - 頁碼
 */
export const useMemberReportsQuery = (
  memberId: string,
  role: MemberReportRole,
  page: number,
) =>
  useApiQuery(
    'GET',
    '/moderation/members/{memberId}/reports',
    { params: { path: { memberId }, query: { role, page } } },
    { enabled: Boolean(memberId) },
  );
