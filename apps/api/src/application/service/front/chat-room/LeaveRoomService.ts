import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LEAVE_ROOM_USE_CASE,
  LeaveRoomCommand,
  LeaveRoomUseCase,
} from '../../../port/in/front/chat-room/LeaveRoomUseCase';
import {
  CHAT_ROOM_REPOSITORY_PORT,
  ChatRoomRepositoryPort,
} from '../../../port/out/chat-room/ChatRoomRepositoryPort';
import {
  EVENT_PUBLISHER_PORT,
  EventPublisherPort,
} from '../../../port/out/EventPublisherPort';
import { SERVER_EVENTS } from '../../../port/out/server-events';
import {
  CHAT_AUDIT_PORT,
  ChatAuditPort,
} from '@app/application/port/out/ChatAuditPort';
import { ChatRoomNotFoundException } from '@app/domain/exception/ChatRoomNotFoundException';

export { LEAVE_ROOM_USE_CASE };

@Injectable()
export class LeaveRoomService implements LeaveRoomUseCase {
  constructor(
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly chatRoomRepo: ChatRoomRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
    @Inject(CHAT_AUDIT_PORT)
    private readonly audit: ChatAuditPort,
  ) {}

  private readonly logger = new Logger(LeaveRoomService.name);

  async execute(command: LeaveRoomCommand): Promise<void> {
    const { roomId, memberId } = command;
    // removeMember 回 false 涵蓋「房間不存在」與「不是成員」兩種情形，
    // 兩者刻意回同一個錯誤——分開等於提供探測房間是否存在的工具
    const removed = await this.chatRoomRepo.removeMember(roomId, memberId);
    if (!removed) throw new ChatRoomNotFoundException();

    // 離開房間會直接刪除成員關係列（刻意不做軟刪除），因此稽核紀錄是
    // 「某人曾在某房間待到某時」的唯一證據。best-effort——稽核失敗不該讓人離不開房間
    await this.audit
      .record({ memberId, action: 'ROOM_LEFT', roomId })
      .catch((error: unknown) => this.logger.error('稽核寫入失敗', error));

    const memberCount = await this.chatRoomRepo.countMembers(roomId);
    this.eventPublisher.publishToRoom(
      roomId,
      SERVER_EVENTS.ROOM_MEMBER_CHANGED,
      {
        roomId,
        memberId,
        action: 'LEFT',
        memberCount,
      },
    );
  }
}
