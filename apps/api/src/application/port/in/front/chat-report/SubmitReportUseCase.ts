import type {
  ChatReportReason,
  ChatReportSummary,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';

export const SUBMIT_REPORT_USE_CASE = 'SUBMIT_REPORT_USE_CASE';

export interface SubmitReportCommand {
  /** 檢舉人；由 MemberContext 帶入，不接受客戶端指定 */
  reporterId: string;
  messageId: string;
  reason: ChatReportReason;
  description?: string;
}

export interface SubmitReportUseCase {
  execute(command: SubmitReportCommand): Promise<ChatReportSummary>;
}
