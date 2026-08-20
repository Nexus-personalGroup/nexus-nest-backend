import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ChatMessageFacade } from '@app/application/facade/front/ChatMessageFacade';
import type { ListMessagesResult } from '@app/application/port/in/front/chat-message/ListMessagesUseCase';
import type { MemberContext } from '@app/application/port/member-context';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { CurrentMember } from '../../decorator/current-member.decorator';
import { MemberScoped } from '../../decorator/member-scoped.decorator';
import {
  listMessagesQuerySchema,
  ListMessagesQuery,
} from './ListMessagesQuery';
import { markRoomReadSchema, MarkRoomReadRequest } from './MarkRoomReadRequest';

/**
 * 房間內的訊息歷史與已讀位置。
 *
 * 與 `ChatRoomController` 共用 `/front/chat-rooms` 前綴但分開成兩支：
 * 房間的生命週期與房間內的內容是兩件事，混在一支 controller 裡會讓它隨著
 * 訊息功能（撤回、附件、搜尋）持續長大。
 *
 * 授權同樣是「呼叫者是不是這個房間的成員」，由 application 層回答。
 */
@MemberScoped()
@Controller('front/chat-rooms')
export class ChatMessageController {
  constructor(private readonly chatMessageFacade: ChatMessageFacade) {}

  @Get(':roomId/messages')
  listMessages(
    @CurrentMember() member: MemberContext,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Query(new ZodValidationPipe(listMessagesQuerySchema))
    query: ListMessagesQuery,
  ): Promise<ListMessagesResult> {
    return this.chatMessageFacade.listMessages({
      roomId,
      memberId: member.sub,
      ...query,
    });
  }

  @Patch(':roomId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @CurrentMember() member: MemberContext,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body(new ZodValidationPipe(markRoomReadSchema)) dto: MarkRoomReadRequest,
  ): Promise<void> {
    await this.chatMessageFacade.markRead({
      roomId,
      memberId: member.sub,
      lastReadSeq: dto.lastReadSeq,
    });
  }
}
