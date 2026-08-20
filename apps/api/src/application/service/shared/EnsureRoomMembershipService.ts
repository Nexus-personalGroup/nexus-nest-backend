import { Inject, Injectable } from '@nestjs/common';
import {
  ENSURE_ROOM_MEMBERSHIP_USE_CASE,
  EnsureRoomMembershipUseCase,
} from '../../port/in/shared/EnsureRoomMembershipUseCase';
import {
  CHAT_ROOM_REPOSITORY_PORT,
  ChatRoomRepositoryPort,
} from '../../port/out/chat-room/ChatRoomRepositoryPort';
import { ChatRoomNotFoundException } from '../../../domain/exception/ChatRoomNotFoundException';

export { ENSURE_ROOM_MEMBERSHIP_USE_CASE };

@Injectable()
export class EnsureRoomMembershipService implements EnsureRoomMembershipUseCase {
  constructor(
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly chatRoomRepo: ChatRoomRepositoryPort,
  ) {}

  async execute(memberId: string, roomId: string): Promise<void> {
    const member = await this.chatRoomRepo.isMember(roomId, memberId);
    // 房間不存在時 isMember 同樣回 false——兩種情形回同一個錯誤是刻意的，
    // 分開等於讓任何已登入者拿任意 ID 探測房間是否存在
    if (!member) throw new ChatRoomNotFoundException();
  }
}
