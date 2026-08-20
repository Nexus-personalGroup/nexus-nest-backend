import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_MY_ROOMS_USE_CASE,
  ListMyRoomsQuery,
  ListMyRoomsResult,
  ListMyRoomsUseCase,
} from '../../../port/in/front/chat-room/ListMyRoomsUseCase';
import {
  CHAT_ROOM_REPOSITORY_PORT,
  ChatRoomRepositoryPort,
} from '../../../port/out/chat-room/ChatRoomRepositoryPort';
import {
  buildPaginationMeta,
  getPagination,
} from '@app/infrastructure/pagination';

export { LIST_MY_ROOMS_USE_CASE };

@Injectable()
export class ListMyRoomsService implements ListMyRoomsUseCase {
  constructor(
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly chatRoomRepo: ChatRoomRepositoryPort,
  ) {}

  async execute(query: ListMyRoomsQuery): Promise<ListMyRoomsResult> {
    const { page, limit } = getPagination({
      page: query.page,
      limit: query.limit,
    });
    const { data, total } = await this.chatRoomRepo.listByMember({
      memberId: query.memberId,
      page,
      limit,
    });
    return { list: data, meta: buildPaginationMeta(page, limit, total) };
  }
}
