import { Inject, Injectable } from '@nestjs/common';
import {
  GET_MEMBER_TIMELINE_USE_CASE,
  GET_REPORT_DETAIL_USE_CASE,
  GetMemberTimelineQuery,
  GetMemberTimelineResult,
  GetMemberTimelineUseCase,
  GetReportDetailQuery,
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
import type { ChatReportDetail } from '@app/application/port/out/chat-report/ChatReportRepositoryPort';

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
  ) {}

  listReports(query: ListReportsQuery): Promise<ListReportsResult> {
    return this.listReportsUseCase.execute(query);
  }

  getReportDetail(query: GetReportDetailQuery): Promise<ChatReportDetail> {
    return this.getReportDetailUseCase.execute(query);
  }

  reviewReport(command: ReviewReportCommand): Promise<void> {
    return this.reviewReportUseCase.execute(command);
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
