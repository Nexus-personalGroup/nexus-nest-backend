import { Inject, Injectable } from '@nestjs/common';
import {
  MARK_ROOM_READ_USE_CASE,
  MarkRoomReadCommand,
  MarkRoomReadUseCase,
} from '@app/application/port/in/front/chat-message/MarkRoomReadUseCase';
import {
  ENSURE_ROOM_MEMBERSHIP_USE_CASE,
  EnsureRoomMembershipUseCase,
} from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import {
  CHAT_ROOM_READ_REPOSITORY_PORT,
  ChatRoomReadRepositoryPort,
} from '@app/application/port/out/chat-message/ChatRoomReadRepositoryPort';
import {
  CHAT_ROOM_REPOSITORY_PORT,
  ChatRoomRepositoryPort,
} from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';
import {
  EVENT_PUBLISHER_PORT,
  EventPublisherPort,
} from '@app/application/port/out/EventPublisherPort';
import { SERVER_EVENTS } from '@app/application/port/out/server-events';

export { MARK_ROOM_READ_USE_CASE };

@Injectable()
export class MarkRoomReadService implements MarkRoomReadUseCase {
  constructor(
    @Inject(ENSURE_ROOM_MEMBERSHIP_USE_CASE)
    private readonly ensureRoomMembership: EnsureRoomMembershipUseCase,
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly chatRoomRepo: ChatRoomRepositoryPort,
    @Inject(CHAT_ROOM_READ_REPOSITORY_PORT)
    private readonly readRepo: ChatRoomReadRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  async execute(command: MarkRoomReadCommand): Promise<void> {
    const { roomId, memberId, lastReadSeq } = command;
    await this.ensureRoomMembership.execute(memberId, roomId);

    // 夾在房間目前的最大序號：客戶端不該能把已讀設到尚不存在的訊息。
    // 允許的話，之後真的送出那些訊息時它們一出生就是已讀狀態
    const roomLastSeq = (await this.chatRoomRepo.getLastSeq(roomId)) ?? 0;
    const target = Math.min(lastReadSeq, roomLastSeq);

    const advanced = await this.readRepo.markRead(roomId, memberId, target);
    // 沒有前進就不推播：往回捲不是事件，推播只會讓其他人的畫面無謂重繪
    if (!advanced) return;

    this.eventPublisher.publishToRoom(roomId, SERVER_EVENTS.ROOM_READ, {
      roomId,
      memberId,
      lastReadSeq: target,
    });
  }
}
