import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GET_REPORT_DETAIL_USE_CASE,
  GetReportDetailQuery,
  GetReportDetailUseCase,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
import {
  CHAT_REPORT_REPOSITORY_PORT,
  ChatReportDetail,
  ChatReportRepositoryPort,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import {
  CHAT_AUDIT_PORT,
  ChatAuditPort,
} from '@app/application/port/out/ChatAuditPort';
import { ChatReportNotFoundException } from '@app/domain/exception/ChatReportNotFoundException';

export { GET_REPORT_DETAIL_USE_CASE };

@Injectable()
export class GetReportDetailService implements GetReportDetailUseCase {
  private readonly logger = new Logger(GetReportDetailService.name);

  constructor(
    @Inject(CHAT_REPORT_REPOSITORY_PORT)
    private readonly reportRepo: ChatReportRepositoryPort,
    @Inject(CHAT_AUDIT_PORT)
    private readonly audit: ChatAuditPort,
  ) {}

  async execute(query: GetReportDetailQuery): Promise<ChatReportDetail> {
    const detail = await this.reportRepo.findDetail(query.reportId);
    if (!detail) throw new ChatReportNotFoundException();

    // **查看本身要留痕跡。** 這是唯一能看到被撤回訊息內容的路徑；
    // 查看不留痕跡的話，它與「任何人都看得到」在事後沒有實質區別——
    // 差別只在誰有權限，而權限可能被誤配、被濫用、或在事後被質疑。
    // best-effort：稽核失敗不該讓調查做不下去
    await this.audit
      .record({
        memberId: query.viewerId,
        action: 'REPORT_VIEWED',
        roomId: detail.roomId,
        targetMemberId: detail.targetMemberId,
        targetMessageId: detail.targetMessageId,
      })
      .catch((error: unknown) => this.logger.error('稽核寫入失敗', error));

    return detail;
  }
}
