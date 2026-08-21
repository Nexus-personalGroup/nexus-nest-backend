import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  RESTORE_MESSAGE_USE_CASE,
  ModerateMessageCommand,
  RestoreMessageUseCase,
} from '@app/application/port/in/admin/moderation/MessageModerationUseCases';
import {
  CHAT_MESSAGE_REPOSITORY_PORT,
  ChatMessageRepositoryPort,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import {
  CHAT_AUDIT_PORT,
  ChatAuditPort,
} from '@app/application/port/out/ChatAuditPort';
import {
  EVENT_PUBLISHER_PORT,
  EventPublisherPort,
} from '@app/application/port/out/EventPublisherPort';
import { SERVER_EVENTS } from '@app/application/port/out/server-events';
import { ChatMessageNotFoundException } from '@app/domain/exception/ChatMessageNotFoundException';

export { RESTORE_MESSAGE_USE_CASE };

@Injectable()
export class RestoreMessageService implements RestoreMessageUseCase {
  private readonly logger = new Logger(RestoreMessageService.name);

  constructor(
    @Inject(CHAT_MESSAGE_REPOSITORY_PORT)
    private readonly messageRepo: ChatMessageRepositoryPort,
    @Inject(CHAT_AUDIT_PORT)
    private readonly audit: ChatAuditPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  async execute(command: ModerateMessageCommand): Promise<void> {
    const { messageId, moderatorId } = command;

    const message = await this.messageRepo.findForModeration(messageId);
    if (!message) throw new ChatMessageNotFoundException();

    const restored = await this.messageRepo.restore(messageId);
    // 本來就沒被移除——沒有任何改變，不推播也不記稽核
    if (!restored) return;

    // **還原也要留稽核**：removedAt 清除後，「這則曾經被移除過」就不再留在訊息列上，
    // 而反覆移除再還原本身就是可疑行為——只有兩邊都記才看得出那個模式
    await this.audit
      .record({
        memberId: moderatorId,
        action: 'MESSAGE_RESTORED',
        roomId: message.roomId,
        targetMemberId: message.senderId,
        targetMessageId: messageId,
      })
      .catch((error: unknown) => this.logger.error('稽核寫入失敗', error));

    // 帶還原後的撤回狀態：若該則原本已被發送者撤回，
    // 客戶端要顯示「訊息已收回」而非完全正常
    this.eventPublisher.publishToRoom(
      message.roomId,
      SERVER_EVENTS.MESSAGE_RESTORED,
      {
        messageId,
        roomId: message.roomId,
        seq: message.seq,
        retractedAt: restored.retractedAt,
      },
    );
  }
}
