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
}
