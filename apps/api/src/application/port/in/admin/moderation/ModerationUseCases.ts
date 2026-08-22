import type { PaginationMeta } from '@app/infrastructure/pagination';
import type {
  ChatReportDetail,
  ChatReportListItem,
  ChatReportStatus,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import type { ChatAuditEntry } from '@app/application/port/out/ChatAuditPort';
import type { MemberReportRole } from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import type {
  AdminRoomSummary,
  ChatRoomSummary,
  ChatRoomType,
} from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';

export const LIST_REPORTS_USE_CASE = 'LIST_REPORTS_USE_CASE';
export const GET_REPORT_DETAIL_USE_CASE = 'GET_REPORT_DETAIL_USE_CASE';
export const REVIEW_REPORT_USE_CASE = 'REVIEW_REPORT_USE_CASE';
export const GET_MEMBER_TIMELINE_USE_CASE = 'GET_MEMBER_TIMELINE_USE_CASE';
export const GET_MEMBER_PROFILE_USE_CASE = 'GET_MEMBER_PROFILE_USE_CASE';
export const LIST_MEMBER_REPORTS_USE_CASE = 'LIST_MEMBER_REPORTS_USE_CASE';
export const LIST_MEMBER_ROOMS_USE_CASE = 'LIST_MEMBER_ROOMS_USE_CASE';
export const LIST_ROOMS_USE_CASE = 'LIST_ROOMS_USE_CASE';
export const GET_ROOM_DETAIL_USE_CASE = 'GET_ROOM_DETAIL_USE_CASE';

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

/**
 * 審閱視角的成員概覽。
 *
 * **只有審閱要回答的問題**：他是誰、他還能不能用、他被檢舉多少次、他現在在不在。
 * 角色與權限回答的是「他能做什麼」——那屬於 `BACKEND:ACCOUNT:VIEW` 圈起來的範圍，
 * 而「反正 loadMemberById 都查回來了，順手全回」是最容易發生的越界。
 */
export interface MemberProfile {
  memberId: string;
  email: string;
  /** 帳號啟用狀態；false 代表已停權 */
  status: boolean;
  joinedAt: Date;
  /** 查詢當下的在線狀態，不保證即時 */
  isOnline: boolean;
  reportedCount: number;
  submittedReportCount: number;
  roomCount: number;
}

export interface GetMemberProfileUseCase {
  execute(memberId: string): Promise<MemberProfile>;
}

/** 相關檢舉的一列；`counterpartEmail` 在對造帳號已刪除時為 null */
export interface MemberReportView {
  reportId: string;
  counterpartId: string;
  counterpartEmail: string | null;
  roomId: string;
  reason: string;
  status: string;
  createdAt: Date;
}

export interface ListMemberReportsQuery {
  memberId: string;
  role?: MemberReportRole;
  page?: number;
  limit?: number;
}

export interface ListMemberReportsResult {
  list: MemberReportView[];
  meta: PaginationMeta;
}

export interface ListMemberReportsUseCase {
  execute(query: ListMemberReportsQuery): Promise<ListMemberReportsResult>;
}

export interface ListMemberRoomsQuery {
  memberId: string;
  page?: number;
  limit?: number;
}

export interface ListMemberRoomsResult {
  list: ChatRoomSummary[];
  meta: PaginationMeta;
}

export interface ListMemberRoomsUseCase {
  execute(query: ListMemberRoomsQuery): Promise<ListMemberRoomsResult>;
}

export interface ListRoomsQuery {
  roomType?: ChatRoomType;
  page?: number;
  limit?: number;
}

export interface ListRoomsResult {
  list: AdminRoomSummary[];
  meta: PaginationMeta;
}

export interface ListRoomsUseCase {
  execute(query: ListRoomsQuery): Promise<ListRoomsResult>;
}

/** 房間成員的視圖；`email` 在帳號已刪除時為 null */
export interface RoomMemberView {
  memberId: string;
  email: string | null;
  joinedAt: Date;
}

export type RoomDetailView = AdminRoomSummary & {
  members: RoomMemberView[];
};

export interface GetRoomDetailUseCase {
  execute(roomId: string): Promise<RoomDetailView>;
}
