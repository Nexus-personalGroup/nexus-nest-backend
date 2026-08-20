import { Inject, Injectable } from '@nestjs/common';
import {
  SYNC_ROOM_USE_CASE,
  SyncRoomQuery,
  SyncRoomResult,
  SyncRoomUseCase,
} from '@app/application/port/in/shared/SyncRoomUseCase';
import {
  ENSURE_ROOM_MEMBERSHIP_USE_CASE,
  EnsureRoomMembershipUseCase,
} from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import {
  CHAT_MESSAGE_REPOSITORY_PORT,
  ChatMessageRepositoryPort,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';

export { SYNC_ROOM_USE_CASE };

/**
 * 單次補齊的則數上限。
 *
 * 不放環境變數：它是協定的一部分（客戶端據此決定要不要再要一次），
 * 而不是需要依環境調整的旋鈕。真要調的時候改這裡並更新 spec。
 */
export const SYNC_BATCH_LIMIT = 100;

@Injectable()
export class SyncRoomService implements SyncRoomUseCase {
  constructor(
    @Inject(ENSURE_ROOM_MEMBERSHIP_USE_CASE)
    private readonly ensureRoomMembership: EnsureRoomMembershipUseCase,
    @Inject(CHAT_MESSAGE_REPOSITORY_PORT)
    private readonly messageRepo: ChatMessageRepositoryPort,
  ) {}

  async execute(query: SyncRoomQuery): Promise<SyncRoomResult> {
    const { roomId, memberId, lastSeq } = query;
    await this.ensureRoomMembership.execute(memberId, roomId);

    // 多要一則來判斷還有沒有更多。用「回傳數 === 上限」判斷會在剛好取完時
    // 誤報 hasMore: true——那只是吵；但反過來若少要一則，剛好滿載時會誤報
    // false，客戶端就此停止補齊，症狀是靜默丟訊息
    const rows = await this.messageRepo.findAfterSeq(
      roomId,
      lastSeq,
      SYNC_BATCH_LIMIT + 1,
    );
    const hasMore = rows.length > SYNC_BATCH_LIMIT;

    return {
      roomId,
      messages: hasMore ? rows.slice(0, SYNC_BATCH_LIMIT) : rows,
      hasMore,
    };
  }
}
