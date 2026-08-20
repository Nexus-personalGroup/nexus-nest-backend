import { Inject, Injectable } from '@nestjs/common';
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
import { ChatRoomNotFoundException } from '@app/domain/exception/ChatRoomNotFoundException';

export { LEAVE_ROOM_USE_CASE };

@Injectable()
export class LeaveRoomService implements LeaveRoomUseCase {
  constructor(
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly chatRoomRepo: ChatRoomRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  async execute(command: LeaveRoomCommand): Promise<void> {
    const { roomId, memberId } = command;
    // removeMember 回 false 涵蓋「房間不存在」與「不是成員」兩種情形，
    // 兩者刻意回同一個錯誤——分開等於提供探測房間是否存在的工具
    const removed = await this.chatRoomRepo.removeMember(roomId, memberId);
    if (!removed) throw new ChatRoomNotFoundException();

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
