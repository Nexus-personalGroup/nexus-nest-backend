import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_MESSAGES_USE_CASE,
  ListMessagesQuery,
  ListMessagesResult,
  ListMessagesUseCase,
} from '@app/application/port/in/front/chat-message/ListMessagesUseCase';
import {
  ENSURE_ROOM_MEMBERSHIP_USE_CASE,
  EnsureRoomMembershipUseCase,
} from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import {
  CHAT_MESSAGE_REPOSITORY_PORT,
  ChatMessageRepositoryPort,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';

export { LIST_MESSAGES_USE_CASE };

/** 歷史查詢的預設與上限筆數 */
export const DEFAULT_HISTORY_LIMIT = 30;
export const MAX_HISTORY_LIMIT = 100;

@Injectable()
export class ListMessagesService implements ListMessagesUseCase {
  constructor(
    @Inject(ENSURE_ROOM_MEMBERSHIP_USE_CASE)
    private readonly ensureRoomMembership: EnsureRoomMembershipUseCase,
    @Inject(CHAT_MESSAGE_REPOSITORY_PORT)
    private readonly messageRepo: ChatMessageRepositoryPort,
  ) {}

  async execute(query: ListMessagesQuery): Promise<ListMessagesResult> {
    const { roomId, memberId, beforeSeq } = query;
    await this.ensureRoomMembership.execute(memberId, roomId);

    const limit = Math.min(
      query.limit ?? DEFAULT_HISTORY_LIMIT,
      MAX_HISTORY_LIMIT,
    );

    // 多要一則來判斷還有沒有更早的。用「回傳數 === limit」判斷會在剛好取完時
    // 誤報 hasMore: true——那只是讓客戶端多打一次空的請求；反過來若少要一則，
    // 剛好滿載時會誤報 false，使用者就再也捲不到更早的訊息
    const rows = await this.messageRepo.findBeforeSeq(
      roomId,
      beforeSeq,
      limit + 1,
    );
    const hasMore = rows.length > limit;

    return { list: hasMore ? rows.slice(0, limit) : rows, hasMore };
  }
}
