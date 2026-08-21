import { Inject, Injectable } from '@nestjs/common';
import {
  SUBMIT_REPORT_USE_CASE,
  SubmitReportCommand,
  SubmitReportUseCase,
} from '@app/application/port/in/front/chat-report/SubmitReportUseCase';
import type { ChatReportSummary } from '@app/application/port/out/chat-report/ChatReportRepositoryPort';

@Injectable()
export class ChatReportFacade {
  constructor(
    @Inject(SUBMIT_REPORT_USE_CASE)
    private readonly submitReportUseCase: SubmitReportUseCase,
  ) {}

  submitReport(command: SubmitReportCommand): Promise<ChatReportSummary> {
    return this.submitReportUseCase.execute(command);
  }
}
