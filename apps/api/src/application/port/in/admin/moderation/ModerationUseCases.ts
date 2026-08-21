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

/**
 * 當事人的 email；帳號已被刪除時為 `null`。
 *
 * **email 加在 in-port 的視圖型別上，不加在 out-port 的 `ChatReportListItem` 上。**
 * `chat_reports` 刻意沒有外鍵（帳號刪除後檢舉仍須可審閱），
 * 把 email 放進持久層的型別等於要求 repository 去 join——那會把「沒有外鍵」
 * 這個決定悄悄推翻。補齊發生在 service，型別也就屬於 service 的輸出。
 */
export interface ReportParticipants {
  reporterEmail: string | null;
  targetMemberEmail: string | null;
}

export type ReportListItemView = ChatReportListItem & ReportParticipants;

export type ReportDetailView = ChatReportDetail &
  ReportParticipants & {
    /**
     * 被檢舉訊息目前的移除時間；未被移除或訊息已不存在時為 `null`。
     *
     * **回時間戳而非布林**：布林會讓「何時被移除」永遠拿不到，
     * 而那是審閱紀錄的一部分。時間戳推得出布林，反之不行。
     */
    targetMessageRemovedAt: Date | null;
  };

export interface ListReportsResult {
  list: ReportListItemView[];
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
  execute(query: GetReportDetailQuery): Promise<ReportDetailView>;
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
