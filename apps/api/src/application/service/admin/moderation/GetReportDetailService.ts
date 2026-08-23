import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GET_REPORT_DETAIL_USE_CASE,
  GetReportDetailQuery,
  GetReportDetailUseCase,
  ReportDetailView,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
import {
  CHAT_REPORT_REPOSITORY_PORT,
  ChatReportRepositoryPort,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import {
  CHAT_MESSAGE_REPOSITORY_PORT,
  ChatMessageRepositoryPort,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
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
    @Inject(LOAD_USER_PORT)
    private readonly userRepo: LoadUserPort,
    @Inject(CHAT_MESSAGE_REPOSITORY_PORT)
    private readonly messageRepo: ChatMessageRepositoryPort,
  ) {}

  async execute(query: GetReportDetailQuery): Promise<ReportDetailView> {
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

    const [emails, target] = await Promise.all([
      this.userRepo.findEmailsByIds([detail.reporterId, detail.targetMemberId]),
      // 走既有的 findForModeration：它已經回 removedAt 且**不回內容**——
      // 訊息表只有一個入口這條守則不需要為了這裡開豁免
      this.messageRepo.findForModeration(detail.targetMessageId),
    ]);

    return {
      ...detail,
      reporterEmail: emails.get(detail.reporterId) ?? null,
      targetMemberEmail: emails.get(detail.targetMemberId) ?? null,
      // 訊息查不到時回 null 而非拋錯：檢舉的快照本來就不依賴訊息是否還在
      targetMessageRemovedAt: target?.removedAt ?? null,
    };
  }
}
