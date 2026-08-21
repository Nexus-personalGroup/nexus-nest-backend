import { Inject, Injectable } from '@nestjs/common';
import {
  REVIEW_REPORT_USE_CASE,
  ReviewReportCommand,
  ReviewReportUseCase,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
import {
  CHAT_REPORT_REPOSITORY_PORT,
  ChatReportRepositoryPort,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import { ChatReportNotFoundException } from '@app/domain/exception/ChatReportNotFoundException';
import { ChatReportInvalidTransitionException } from '@app/domain/exception/ChatReportInvalidTransitionException';

export { REVIEW_REPORT_USE_CASE };

@Injectable()
export class ReviewReportService implements ReviewReportUseCase {
  constructor(
    @Inject(CHAT_REPORT_REPOSITORY_PORT)
    private readonly reportRepo: ChatReportRepositoryPort,
  ) {}

  async execute(command: ReviewReportCommand): Promise<void> {
    const { reportId, status, reviewerId, reviewNote } = command;

    // 回到待處理是「重新開啟」，語意與「終態間的更正」不同，目前沒有這個需求。
    // REVIEWED ↔ DISMISSED 互轉是允許的
    if (status === 'PENDING') throw new ChatReportInvalidTransitionException();

    const updated = await this.reportRepo.updateStatus({
      reportId,
      status,
      reviewedBy: reviewerId,
      reviewNote,
    });
    if (!updated) throw new ChatReportNotFoundException();
  }
}
