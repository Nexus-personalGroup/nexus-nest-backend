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
  REINSTATE_FRONT_USER_USE_CASE,
  ReinstateFrontUserUseCase,
  SUSPEND_FRONT_USER_USE_CASE,
  SuspendFrontUserUseCase,
} from '@app/application/port/in/admin/moderation/FrontUserSuspensionUseCases';

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
    // 停權走**前台使用者專屬的 use case**，與帳號管理的 UPDATE_MEMBER_USE_CASE 分開：
    // 兩者停的是不同的東西（`users` vs `members`），共用一支再用參數分流，
    // 傳錯的後果是停錯人而且沒有任何錯誤訊息
    @Inject(SUSPEND_FRONT_USER_USE_CASE)
    private readonly suspendFrontUserUseCase: SuspendFrontUserUseCase,
    @Inject(REINSTATE_FRONT_USER_USE_CASE)
    private readonly reinstateFrontUserUseCase: ReinstateFrontUserUseCase,
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
    return this.suspendFrontUserUseCase.execute({
      userId: memberId,
      moderatorId: actorId,
    });
  }

  reinstateMember(memberId: string, actorId: string): Promise<void> {
    return this.reinstateFrontUserUseCase.execute({
      userId: memberId,
      moderatorId: actorId,
    });
  }
}
