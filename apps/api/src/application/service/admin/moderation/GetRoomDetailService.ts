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
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
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
    @Inject(LOAD_USER_PORT)
    private readonly userRepo: LoadUserPort,
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

    // 一次批次補齊。成員關係只存 ID（不建外鍵，帳號刪除的處置屬於業務決定），
    // 而那個 ID 一律是**前台使用者**——聊天的參與者不會是後台管理員
    const emails = await this.userRepo.findEmailsByIds(
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
