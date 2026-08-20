import type { ChatMessage } from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';

export const LIST_MESSAGES_USE_CASE = 'LIST_MESSAGES_USE_CASE';

export interface ListMessagesQuery {
  roomId: string;
  memberId: string;
  /** 游標：回傳 seq 小於此值的訊息。未指定代表從最新開始 */
  beforeSeq?: number;
  limit?: number;
}

export interface ListMessagesResult {
  list: ChatMessage[];
  hasMore: boolean;
}

export interface ListMessagesUseCase {
  execute(query: ListMessagesQuery): Promise<ListMessagesResult>;
}
