import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_MESSAGES_USE_CASE,
  ListMessagesQuery,
  ListMessagesResult,
  ListMessagesUseCase,
} from '@app/application/port/in/front/chat-message/ListMessagesUseCase';
import {
  MARK_ROOM_READ_USE_CASE,
  MarkRoomReadCommand,
  MarkRoomReadUseCase,
} from '@app/application/port/in/front/chat-message/MarkRoomReadUseCase';

@Injectable()
export class ChatMessageFacade {
  constructor(
    @Inject(LIST_MESSAGES_USE_CASE)
    private readonly listMessagesUseCase: ListMessagesUseCase,
    @Inject(MARK_ROOM_READ_USE_CASE)
    private readonly markRoomReadUseCase: MarkRoomReadUseCase,
  ) {}

  listMessages(query: ListMessagesQuery): Promise<ListMessagesResult> {
    return this.listMessagesUseCase.execute(query);
  }

  markRead(command: MarkRoomReadCommand): Promise<void> {
    return this.markRoomReadUseCase.execute(command);
  }
}
