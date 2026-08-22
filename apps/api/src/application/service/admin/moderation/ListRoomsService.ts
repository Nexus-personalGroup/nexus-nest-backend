import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_ROOMS_USE_CASE,
  ListRoomsQuery,
  ListRoomsResult,
  ListRoomsUseCase,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
import {
  CHAT_ROOM_REPOSITORY_PORT,
  ChatRoomRepositoryPort,
} from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';
import {
  buildPaginationMeta,
  getPagination,
} from '@app/infrastructure/pagination';

export { LIST_ROOMS_USE_CASE };

/**
 * 後台的聊天室列表。
 *
 * 與其他概覽端點一樣**不寫稽核**：回應不含任何訊息內容。
 */
@Injectable()
export class ListRoomsService implements ListRoomsUseCase {
  constructor(
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly roomRepo: ChatRoomRepositoryPort,
  ) {}

  async execute(query: ListRoomsQuery): Promise<ListRoomsResult> {
    const { page, limit } = getPagination({
      page: query.page,
      limit: query.limit,
    });
    const { data, total } = await this.roomRepo.listAll({
      roomType: query.roomType,
      page,
      limit,
    });

    return { list: data, meta: buildPaginationMeta(page, limit, total) };
  }
}
