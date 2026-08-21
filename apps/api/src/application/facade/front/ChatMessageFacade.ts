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
import {
  RETRACT_MESSAGE_USE_CASE,
  RetractMessageCommand,
  RetractMessageUseCase,
} from '@app/application/port/in/front/chat-message/RetractMessageUseCase';

@Injectable()
export class ChatMessageFacade {
  constructor(
    @Inject(LIST_MESSAGES_USE_CASE)
    private readonly listMessagesUseCase: ListMessagesUseCase,
    @Inject(MARK_ROOM_READ_USE_CASE)
    private readonly markRoomReadUseCase: MarkRoomReadUseCase,
    @Inject(RETRACT_MESSAGE_USE_CASE)
    private readonly retractMessageUseCase: RetractMessageUseCase,
  ) {}

  listMessages(query: ListMessagesQuery): Promise<ListMessagesResult> {
    return this.listMessagesUseCase.execute(query);
  }

  markRead(command: MarkRoomReadCommand): Promise<void> {
    return this.markRoomReadUseCase.execute(command);
  }

  retractMessage(command: RetractMessageCommand): Promise<void> {
    return this.retractMessageUseCase.execute(command);
  }
}
