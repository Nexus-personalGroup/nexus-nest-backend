import type { PaginationMeta } from '@app/infrastructure/pagination';
import type { ChatRoomSummary } from '../../../out/chat-room/ChatRoomRepositoryPort';

export const LIST_MY_ROOMS_USE_CASE = 'LIST_MY_ROOMS_USE_CASE';

export interface ListMyRoomsQuery {
  /** 呼叫者自己；沒有「查別人的房間」這個入口，因此不是可選參數 */
  memberId: string;
  page?: number;
  limit?: number;
}

export interface ListMyRoomsResult {
  list: ChatRoomSummary[];
  meta: PaginationMeta;
}

export interface ListMyRoomsUseCase {
  execute(query: ListMyRoomsQuery): Promise<ListMyRoomsResult>;
}
