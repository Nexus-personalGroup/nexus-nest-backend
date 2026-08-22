import { Inject, Injectable } from '@nestjs/common';
import {
  GET_ROOM_DETAIL_USE_CASE,
  GetRoomDetailUseCase,
  RoomDetailView,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
import {
  CHAT_ROOM_REPOSITORY_PORT,
  ChatRoomRepositoryPort,
} from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '@app/application/port/out/member/LoadMemberPort';
import { ChatRoomNotFoundException } from '@app/domain/exception/ChatRoomNotFoundException';

export { GET_ROOM_DETAIL_USE_CASE };

/**
 * 後台的單一房間概覽。
 *
 * **回應不含訊息內容，也不含任何訊息 ID**——房間詳情不是內容存取路徑。
 * 要看內容仍然只能經由檢舉，那保持了「看內容必須有理由」。
 */
@Injectable()
export class GetRoomDetailService implements GetRoomDetailUseCase {
  constructor(
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly roomRepo: ChatRoomRepositoryPort,
    @Inject(LOAD_MEMBER_PORT)
    private readonly memberRepo: LoadMemberPort,
  ) {}

  /**
   * 取房間概覽與成員清單
   *
   * @param roomId - 房間 ID
   * @throws ChatRoomNotFoundException 房間不存在
   */
  async execute(roomId: string): Promise<RoomDetailView> {
    const room = await this.roomRepo.findAdminDetail(roomId);
    if (!room) throw new ChatRoomNotFoundException();

    // 一次批次補齊；成員關係只存 memberId（不建外鍵，帳號刪除的處置屬於業務決定）
    const emails = await this.memberRepo.findEmailsByIds(
      room.members.map((member) => member.memberId),
    );

    return {
      ...room,
      members: room.members.map((member) => ({
        ...member,
        email: emails.get(member.memberId) ?? null,
      })),
    };
  }
}
