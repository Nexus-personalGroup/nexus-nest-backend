import { Inject, Injectable } from '@nestjs/common';
import {
  RETRACT_MESSAGE_USE_CASE,
  RetractMessageCommand,
  RetractMessageUseCase,
} from '@app/application/port/in/front/chat-message/RetractMessageUseCase';
import {
  ENSURE_ROOM_MEMBERSHIP_USE_CASE,
  EnsureRoomMembershipUseCase,
} from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import {
  CHAT_MESSAGE_REPOSITORY_PORT,
  ChatMessageRepositoryPort,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import {
  EVENT_PUBLISHER_PORT,
  EventPublisherPort,
} from '@app/application/port/out/EventPublisherPort';
import { SERVER_EVENTS } from '@app/application/port/out/server-events';
import { getEnv } from '@app/infrastructure/validate-env';
import { ChatMessageNotFoundException } from '@app/domain/exception/ChatMessageNotFoundException';
import { ChatMessageRetractExpiredException } from '@app/domain/exception/ChatMessageRetractExpiredException';

export { RETRACT_MESSAGE_USE_CASE };

@Injectable()
export class RetractMessageService implements RetractMessageUseCase {
  constructor(
    @Inject(ENSURE_ROOM_MEMBERSHIP_USE_CASE)
    private readonly ensureRoomMembership: EnsureRoomMembershipUseCase,
    @Inject(CHAT_MESSAGE_REPOSITORY_PORT)
    private readonly messageRepo: ChatMessageRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  async execute(command: RetractMessageCommand): Promise<void> {
    const { roomId, messageId, memberId } = command;
    await this.ensureRoomMembership.execute(memberId, roomId);

    const message = await this.messageRepo.findOwnership(roomId, messageId);
    // 「不存在」與「不是你發的」回同一個錯誤：分開等於提供探測任意訊息是否存在的工具
    if (!message || message.senderId !== memberId) {
      throw new ChatMessageNotFoundException();
    }

    // 已撤回時直接視為成功且不再推播。撤回是收斂到某個狀態而非遞增操作，
    // 回錯誤只會逼客戶端處理一個沒有意義的分支
    if (message.retractedAt) return;

    // 時限以伺服器的 createdAt 為準，不看客戶端時間——這是授權判斷，
    // 而客戶端的時鐘不可信。直接用 Date.now() 跟隨專案既有慣例（沒有時鐘抽象），
    // 測試以相對於現在的 createdAt 建 fixture 即可，不需要注入時鐘
    const windowMs = getEnv().CHAT_RETRACT_WINDOW_SEC * 1_000;
    if (Date.now() - message.createdAt.getTime() > windowMs) {
      throw new ChatMessageRetractExpiredException();
    }

    const retractedAt = await this.messageRepo.retract(messageId, memberId);

    // 推播不含 content——那正是撤回要移除的東西
    this.eventPublisher.publishToRoom(roomId, SERVER_EVENTS.MESSAGE_RETRACTED, {
      messageId,
      roomId,
      retractedAt,
    });
  }
}
