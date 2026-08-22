import { Inject, Injectable } from '@nestjs/common';
import {
  GET_MEMBER_TIMELINE_USE_CASE,
  GET_REPORT_DETAIL_USE_CASE,
  GetMemberTimelineQuery,
  GetMemberTimelineResult,
  GetMemberTimelineUseCase,
  GetMemberProfileUseCase,
  GET_MEMBER_PROFILE_USE_CASE,
  GetReportDetailQuery,
  ListMemberReportsQuery,
  ListMemberReportsResult,
  ListMemberReportsUseCase,
  LIST_MEMBER_REPORTS_USE_CASE,
  ListMemberRoomsQuery,
  ListMemberRoomsResult,
  ListMemberRoomsUseCase,
  LIST_MEMBER_ROOMS_USE_CASE,
  ListRoomsQuery,
  ListRoomsResult,
  ListRoomsUseCase,
  LIST_ROOMS_USE_CASE,
  GetRoomDetailUseCase,
  GET_ROOM_DETAIL_USE_CASE,
  RoomDetailView,
  MemberProfile,
  ReportDetailView,
  GetReportDetailUseCase,
  LIST_REPORTS_USE_CASE,
  ListReportsQuery,
  ListReportsResult,
  ListReportsUseCase,
  REVIEW_REPORT_USE_CASE,
  ReviewReportCommand,
  ReviewReportUseCase,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
import {
  REMOVE_MESSAGE_USE_CASE,
  RESTORE_MESSAGE_USE_CASE,
  ModerateMessageCommand,
  RemoveMessageUseCase,
  RestoreMessageUseCase,
} from '@app/application/port/in/admin/moderation/MessageModerationUseCases';
import {
  UPDATE_MEMBER_USE_CASE,
  UpdateMemberUseCase,
} from '@app/application/port/in/admin/member/UpdateMemberUseCase';

@Injectable()
export class ModerationFacade {
  constructor(
    @Inject(LIST_REPORTS_USE_CASE)
    private readonly listReportsUseCase: ListReportsUseCase,
    @Inject(GET_REPORT_DETAIL_USE_CASE)
    private readonly getReportDetailUseCase: GetReportDetailUseCase,
    @Inject(REVIEW_REPORT_USE_CASE)
    private readonly reviewReportUseCase: ReviewReportUseCase,
    @Inject(GET_MEMBER_TIMELINE_USE_CASE)
    private readonly getMemberTimelineUseCase: GetMemberTimelineUseCase,
    @Inject(REMOVE_MESSAGE_USE_CASE)
    private readonly removeMessageUseCase: RemoveMessageUseCase,
    @Inject(RESTORE_MESSAGE_USE_CASE)
    private readonly restoreMessageUseCase: RestoreMessageUseCase,
    // 停權走與帳號管理**同一個 use case**：各自實作會讓斷線與稽核的行為分歧，
    // 而分歧的那一邊不會有人發現
    @Inject(UPDATE_MEMBER_USE_CASE)
    private readonly updateMemberUseCase: UpdateMemberUseCase,
    @Inject(GET_MEMBER_PROFILE_USE_CASE)
    private readonly getMemberProfileUseCase: GetMemberProfileUseCase,
    @Inject(LIST_MEMBER_REPORTS_USE_CASE)
    private readonly listMemberReportsUseCase: ListMemberReportsUseCase,
    @Inject(LIST_MEMBER_ROOMS_USE_CASE)
    private readonly listMemberRoomsUseCase: ListMemberRoomsUseCase,
    @Inject(LIST_ROOMS_USE_CASE)
    private readonly listRoomsUseCase: ListRoomsUseCase,
    @Inject(GET_ROOM_DETAIL_USE_CASE)
    private readonly getRoomDetailUseCase: GetRoomDetailUseCase,
  ) {}

  listReports(query: ListReportsQuery): Promise<ListReportsResult> {
    return this.listReportsUseCase.execute(query);
  }

  getReportDetail(query: GetReportDetailQuery): Promise<ReportDetailView> {
    return this.getReportDetailUseCase.execute(query);
  }

  reviewReport(command: ReviewReportCommand): Promise<void> {
    return this.reviewReportUseCase.execute(command);
  }

  getMemberProfile(memberId: string): Promise<MemberProfile> {
    return this.getMemberProfileUseCase.execute(memberId);
  }

  listMemberReports(
    query: ListMemberReportsQuery,
  ): Promise<ListMemberReportsResult> {
    return this.listMemberReportsUseCase.execute(query);
  }

  listMemberRooms(query: ListMemberRoomsQuery): Promise<ListMemberRoomsResult> {
    return this.listMemberRoomsUseCase.execute(query);
  }

  listRooms(query: ListRoomsQuery): Promise<ListRoomsResult> {
    return this.listRoomsUseCase.execute(query);
  }

  getRoomDetail(roomId: string): Promise<RoomDetailView> {
    return this.getRoomDetailUseCase.execute(roomId);
  }

  getMemberTimeline(
    query: GetMemberTimelineQuery,
  ): Promise<GetMemberTimelineResult> {
    return this.getMemberTimelineUseCase.execute(query);
  }

  removeMessage(command: ModerateMessageCommand): Promise<void> {
    return this.removeMessageUseCase.execute(command);
  }

  restoreMessage(command: ModerateMessageCommand): Promise<void> {
    return this.restoreMessageUseCase.execute(command);
  }

  suspendMember(memberId: string, actorId: string): Promise<void> {
    return this.updateMemberUseCase.execute({
      id: memberId,
      actorId,
      status: false,
    });
  }

  reinstateMember(memberId: string, actorId: string): Promise<void> {
    return this.updateMemberUseCase.execute({
      id: memberId,
      actorId,
      status: true,
    });
  }
}
