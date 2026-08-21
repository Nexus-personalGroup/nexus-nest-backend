import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  REMOVE_MESSAGE_USE_CASE,
  ModerateMessageCommand,
  RemoveMessageUseCase,
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

export { REMOVE_MESSAGE_USE_CASE };

@Injectable()
export class RemoveMessageService implements RemoveMessageUseCase {
  private readonly logger = new Logger(RemoveMessageService.name);

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

    // 管理員的入口是訊息本身而非房間，因此用專屬的查詢——它不需要 roomId，
    // 也不回傳內容（不取就沒有洩漏的可能）
    const message = await this.messageRepo.findForModeration(messageId);
    if (!message) throw new ChatMessageNotFoundException();

    const removedAt = await this.messageRepo.remove(messageId, moderatorId);
    // 已經是移除狀態——沒有任何改變，不推播也不記稽核
    if (!removedAt) return;

    await this.audit
      .record({
        memberId: moderatorId,
        action: 'MESSAGE_REMOVED',
        roomId: message.roomId,
        targetMemberId: message.senderId,
        targetMessageId: messageId,
      })
      .catch((error: unknown) => this.logger.error('稽核寫入失敗', error));

    this.eventPublisher.publishToRoom(
      message.roomId,
      SERVER_EVENTS.MESSAGE_REMOVED,
      { messageId, roomId: message.roomId, seq: message.seq, removedAt },
    );
  }
}
