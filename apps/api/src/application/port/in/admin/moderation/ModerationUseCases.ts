import type { PaginationMeta } from '@app/infrastructure/pagination';
import type {
  ChatReportDetail,
  ChatReportListItem,
  ChatReportStatus,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import type { ChatAuditEntry } from '@app/application/port/out/ChatAuditPort';

export const LIST_REPORTS_USE_CASE = 'LIST_REPORTS_USE_CASE';
export const GET_REPORT_DETAIL_USE_CASE = 'GET_REPORT_DETAIL_USE_CASE';
export const REVIEW_REPORT_USE_CASE = 'REVIEW_REPORT_USE_CASE';
export const GET_MEMBER_TIMELINE_USE_CASE = 'GET_MEMBER_TIMELINE_USE_CASE';

export interface ListReportsQuery {
  status?: ChatReportStatus;
  page?: number;
  limit?: number;
}

export interface ListReportsResult {
  list: ChatReportListItem[];
  meta: PaginationMeta;
}

export interface ListReportsUseCase {
  execute(query: ListReportsQuery): Promise<ListReportsResult>;
}

export interface GetReportDetailQuery {
  reportId: string;
  /** 查看者；查看這件事本身會被稽核 */
  viewerId: string;
}

export interface GetReportDetailUseCase {
  execute(query: GetReportDetailQuery): Promise<ChatReportDetail>;
}

export interface ReviewReportCommand {
  reportId: string;
  status: ChatReportStatus;
  reviewerId: string;
  reviewNote?: string;
}

export interface ReviewReportUseCase {
  execute(command: ReviewReportCommand): Promise<void>;
}

export interface GetMemberTimelineQuery {
  memberId: string;
  page?: number;
  limit?: number;
}

export interface GetMemberTimelineResult {
  list: ChatAuditEntry[];
  meta: PaginationMeta;
}

export interface GetMemberTimelineUseCase {
  execute(query: GetMemberTimelineQuery): Promise<GetMemberTimelineResult>;
}
