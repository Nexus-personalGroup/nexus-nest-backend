import { Inject, Injectable } from '@nestjs/common';
import {
  CREATE_GROUP_ROOM_USE_CASE,
  CreateGroupRoomCommand,
  CreateGroupRoomUseCase,
} from '../../../port/in/front/chat-room/CreateGroupRoomUseCase';
import {
  CHAT_ROOM_REPOSITORY_PORT,
  ChatRoomRepositoryPort,
  ChatRoomSummary,
} from '../../../port/out/chat-room/ChatRoomRepositoryPort';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../../port/out/member/LoadMemberPort';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';

export { CREATE_GROUP_ROOM_USE_CASE };

@Injectable()
export class CreateGroupRoomService implements CreateGroupRoomUseCase {
  constructor(
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly chatRoomRepo: ChatRoomRepositoryPort,
    @Inject(LOAD_MEMBER_PORT)
    private readonly memberRepo: LoadMemberPort,
  ) {}

  async execute(command: CreateGroupRoomCommand): Promise<ChatRoomSummary> {
    const { memberId, name, memberIds } = command;
    // 去重並排除建立者：客戶端把自己也放進清單是常見的，不該因此建出重複成員關係
    const invited = [...new Set(memberIds)].filter((id) => id !== memberId);

    const active = await this.memberRepo.findActiveMemberIds(invited);
    // 略過不合格者會讓呼叫端以為所有人都加入了，且沒有任何徵兆——整批失敗才誠實
    if (active.length !== invited.length) throw new MemberNotFoundException();

    return this.chatRoomRepo.createGroup({
      name,
      memberIds: invited,
      createdBy: memberId,
    });
  }
}
