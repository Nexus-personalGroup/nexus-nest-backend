import { Inject, Injectable } from '@nestjs/common';
import {
  CREATE_DIRECT_ROOM_USE_CASE,
  CreateDirectRoomCommand,
  CreateDirectRoomUseCase,
} from '../../../port/in/front/chat-room/CreateDirectRoomUseCase';
import {
  CHAT_ROOM_REPOSITORY_PORT,
  ChatRoomRepositoryPort,
  ChatRoomSummary,
} from '../../../port/out/chat-room/ChatRoomRepositoryPort';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../../port/out/member/LoadMemberPort';
import { directKeyOf } from '@app/domain/chat/direct-key';
import { ChatRoomSelfDirectException } from '@app/domain/exception/ChatRoomSelfDirectException';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';

export { CREATE_DIRECT_ROOM_USE_CASE };

@Injectable()
export class CreateDirectRoomService implements CreateDirectRoomUseCase {
  constructor(
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly chatRoomRepo: ChatRoomRepositoryPort,
    @Inject(LOAD_MEMBER_PORT)
    private readonly memberRepo: LoadMemberPort,
  ) {}

  async execute(command: CreateDirectRoomCommand): Promise<ChatRoomSummary> {
    const { memberId, targetMemberId } = command;
    if (memberId === targetMemberId) throw new ChatRoomSelfDirectException();

    const active = await this.memberRepo.findActiveMemberIds([targetMemberId]);
    if (active.length === 0) throw new MemberNotFoundException();

    // 不先查「有沒有既有房間」——那個查詢與後續建立之間有空窗，兩邊同時開啟對話
    // 就會各自查到「沒有」而建出兩個房間。唯一性交給 directKey 的 unique index，
    // 撞到時由 repository 回傳既有房間。
    return this.chatRoomRepo.findOrCreateDirect({
      directKey: directKeyOf(memberId, targetMemberId),
      memberIds: [memberId, targetMemberId],
      createdBy: memberId,
    });
  }
}
