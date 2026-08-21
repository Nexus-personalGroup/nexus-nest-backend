import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SUBMIT_REPORT_USE_CASE,
  SubmitReportCommand,
  SubmitReportUseCase,
} from '@app/application/port/in/front/chat-report/SubmitReportUseCase';
import {
  ENSURE_ROOM_MEMBERSHIP_USE_CASE,
  EnsureRoomMembershipUseCase,
} from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import {
  CHAT_MESSAGE_REPOSITORY_PORT,
  ChatMessageRepositoryPort,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import {
  CHAT_REPORT_REPOSITORY_PORT,
  ChatReportRepositoryPort,
  ChatReportSummary,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import {
  CHAT_AUDIT_PORT,
  ChatAuditPort,
} from '@app/application/port/out/ChatAuditPort';
import { ChatMessageNotFoundException } from '@app/domain/exception/ChatMessageNotFoundException';
import { ChatReportSelfException } from '@app/domain/exception/ChatReportSelfException';

export { SUBMIT_REPORT_USE_CASE };

@Injectable()
export class SubmitReportService implements SubmitReportUseCase {
  private readonly logger = new Logger(SubmitReportService.name);

  constructor(
    @Inject(ENSURE_ROOM_MEMBERSHIP_USE_CASE)
    private readonly ensureRoomMembership: EnsureRoomMembershipUseCase,
    @Inject(CHAT_MESSAGE_REPOSITORY_PORT)
    private readonly messageRepo: ChatMessageRepositoryPort,
    @Inject(CHAT_REPORT_REPOSITORY_PORT)
    private readonly reportRepo: ChatReportRepositoryPort,
    @Inject(CHAT_AUDIT_PORT)
    private readonly audit: ChatAuditPort,
  ) {}

  async execute(command: SubmitReportCommand): Promise<ChatReportSummary> {
    const { reporterId, messageId, reason, description } = command;

    // 取原始內容（含已撤回的）：被撤回的訊息也必須能被檢舉，
    // 而檢舉的價值在於留下當下那句話
    const message = await this.messageRepo.findForReport(messageId);
    if (!message) throw new ChatMessageNotFoundException();

    // 不能檢舉自己看不到的訊息。非成員與訊息不存在回同一個錯誤——
    // 分開等於提供探測任意訊息是否存在的工具
    try {
      await this.ensureRoomMembership.execute(reporterId, message.roomId);
    } catch {
      throw new ChatMessageNotFoundException();
    }

    // 檢舉自己不是檢舉，而且會是繞過撤回時限的側門（讓管理員幫忙刪掉）
    if (message.senderId === reporterId) throw new ChatReportSelfException();

    const report = await this.reportRepo.findOrCreate({
      reporterId,
      targetMessageId: messageId,
      targetMemberId: message.senderId,
      roomId: message.roomId,
      reason,
      description,
      contentSnapshot: message.rawContent,
    });

    // 檢舉紀錄本身留著，但「誰在什麼時候檢舉了誰」的時間軸只有稽核表有，
    // 那是判斷檢舉濫用的依據。best-effort——稽核失敗不該讓檢舉送不出去
    await this.audit
      .record({
        memberId: reporterId,
        action: 'REPORT_SUBMITTED',
        roomId: message.roomId,
        targetMemberId: message.senderId,
        targetMessageId: messageId,
      })
      .catch((error: unknown) => this.logger.error('稽核寫入失敗', error));

    return report;
  }
}
