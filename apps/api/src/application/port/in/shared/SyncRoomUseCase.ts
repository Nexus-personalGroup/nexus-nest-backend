import type { ChatMessage } from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';

export const SYNC_ROOM_USE_CASE = 'SYNC_ROOM_USE_CASE';

export interface SyncRoomQuery {
  roomId: string;
  memberId: string;
  /** 客戶端最後收到的 seq；回傳大於它的訊息 */
  lastSeq: number;
}

export interface SyncRoomResult {
  roomId: string;
  messages: ChatMessage[];
  /**
   * 是否還有更多未補齊的訊息。
   *
   * 沒有這個旗標，「補齊上限」會靜默地變成「丟訊息」——客戶端會以為
   * 斷線期間只有這幾則。這正是本功能要防的問題之一，不能自己再製造一次。
   */
  hasMore: boolean;
}

export interface SyncRoomUseCase {
  execute(query: SyncRoomQuery): Promise<SyncRoomResult>;
}
