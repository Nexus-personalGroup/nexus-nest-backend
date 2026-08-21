import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SEND_MESSAGE_USE_CASE,
  SendMessageCommand,
  SendMessageUseCase,
} from '@app/application/port/in/shared/SendMessageUseCase';
import {
  ENSURE_ROOM_MEMBERSHIP_USE_CASE,
  EnsureRoomMembershipUseCase,
} from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import {
  CHAT_MESSAGE_REPOSITORY_PORT,
  ChatMessage,
  ChatMessageRepositoryPort,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import {
  MESSAGE_RATE_LIMIT_PORT,
  MessageRateLimitPort,
} from '@app/application/port/out/MessageRateLimitPort';
import {
  EVENT_PUBLISHER_PORT,
  EventPublisherPort,
} from '@app/application/port/out/EventPublisherPort';
import { SERVER_EVENTS } from '@app/application/port/out/server-events';
import {
  CHAT_AUDIT_PORT,
  ChatAuditPort,
} from '@app/application/port/out/ChatAuditPort';
import {
  METRICS_PORT,
  MetricsPort,
} from '@app/application/port/out/MetricsPort';
import { ChatMessageRateLimitedException } from '@app/domain/exception/ChatMessageRateLimitedException';

export { SEND_MESSAGE_USE_CASE };

@Injectable()
export class SendMessageService implements SendMessageUseCase {
  constructor(
    @Inject(ENSURE_ROOM_MEMBERSHIP_USE_CASE)
    private readonly ensureRoomMembership: EnsureRoomMembershipUseCase,
    @Inject(MESSAGE_RATE_LIMIT_PORT)
    private readonly rateLimit: MessageRateLimitPort,
    @Inject(CHAT_MESSAGE_REPOSITORY_PORT)
    private readonly messageRepo: ChatMessageRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
    @Inject(CHAT_AUDIT_PORT)
    private readonly audit: ChatAuditPort,
    @Inject(METRICS_PORT)
    private readonly metrics: MetricsPort,
  ) {}

  private readonly logger = new Logger(SendMessageService.name);

  async execute(command: SendMessageCommand): Promise<ChatMessage> {
    const { roomId, senderId, content, clientMessageId } = command;

    // 順序是有意的：先確認有資格待在這個房間，才計入他的發送額度。
    // 反過來的話，非成員的探測請求會消耗被冒用者的配額
    await this.ensureRoomMembership.execute(senderId, roomId);

    if (await this.rateLimit.hitAndCheck(senderId, roomId)) {
      // 被限流擋下不會留下任何其他痕跡，而它是洗版行為的唯一證據
      await this.audit
        .record({ memberId: senderId, action: 'MESSAGE_RATE_LIMITED', roomId })
        .catch((error: unknown) => this.logger.error('稽核寫入失敗', error));
      this.metrics.incrementRateLimited();
      throw new ChatMessageRateLimitedException();
    }

    const startedAt = Date.now();
    const { message, deduplicated } = await this.messageRepo.append({
      roomId,
      senderId,
      content,
      clientMessageId,
    });
    // 量的是 append() 的耗時，含配號的鎖等待——熱門房間會不會排隊只能靠它看出來
    this.metrics.observeMessageWriteSeconds((Date.now() - startedAt) / 1_000);

    // 重送不重播：首次送出時已經廣播過了，再播一次對其他成員就是重複訊息。
    //
    // 代價知情——若首次寫入成功但行程在廣播前死亡，這則訊息不會出現在任何人的
    // 即時畫面上。那個缺口由 syncRoom 補齊涵蓋，而不是靠重播碰運氣。
    if (!deduplicated) {
      // 重送不計數：那不是一則新訊息
      this.metrics.incrementMessages();
      this.eventPublisher.publishToRoom(
        roomId,
        SERVER_EVENTS.MESSAGE_CREATED,
        message,
      );
    }

    return message;
  }
}
