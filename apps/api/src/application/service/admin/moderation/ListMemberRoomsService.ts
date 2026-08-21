import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_MEMBER_ROOMS_USE_CASE,
  ListMemberRoomsQuery,
  ListMemberRoomsResult,
  ListMemberRoomsUseCase,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
import {
  CHAT_ROOM_REPOSITORY_PORT,
  ChatRoomRepositoryPort,
} from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';
import {
  buildPaginationMeta,
  getPagination,
} from '@app/infrastructure/pagination';

export { LIST_MEMBER_ROOMS_USE_CASE };

/**
 * 某成員所在的聊天室清單。
 *
 * **直接複用前台「我的房間」的同一支查詢**：同一個查詢寫兩份，
 * 日後改了一份忘了另一份就會產生兩種「房間清單」。
 *
 * 差別只在授權的來源：前台是「你只能查自己的」（memberId 來自 token），
 * 這裡是「有 MODERATION:VIEW 就能查任何人的」（memberId 來自 path）。
 * **因此 memberId 只能來自 path 參數**——若它有機會來自 body 或 query 的可選欄位，
 * 前台那條路徑就會有機會傳入別人的 id。
 */
@Injectable()
export class ListMemberRoomsService implements ListMemberRoomsUseCase {
  constructor(
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly roomRepo: ChatRoomRepositoryPort,
  ) {}

  async execute(query: ListMemberRoomsQuery): Promise<ListMemberRoomsResult> {
    const { page, limit } = getPagination({
      page: query.page,
      limit: query.limit,
    });
    const { data, total } = await this.roomRepo.listByMember({
      memberId: query.memberId,
      page,
      limit,
    });

    return { list: data, meta: buildPaginationMeta(page, limit, total) };
  }
}
