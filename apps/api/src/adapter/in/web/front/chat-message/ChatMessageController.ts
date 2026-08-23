import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatMessageFacade } from '@app/application/facade/front/ChatMessageFacade';
import type { ListMessagesResult } from '@app/application/port/in/front/chat-message/ListMessagesUseCase';
import type { UserContext } from '@app/application/port/user-context';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { CurrentUser } from '../../decorator/current-user.decorator';
import { Public } from '../../decorator/public.decorator';
import { FrontJwtAuthGuard } from '../../guard/FrontJwtAuthGuard';
import { EmailVerifiedGuard } from '../../guard/EmailVerifiedGuard';
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
 * 授權同樣是「呼叫者是不是這個房間的成員」，由 application 層回答。 *
 * `@Public()` 是給**全域的後台 Guard** 看的（讓它略過這些路由），
 * 實際的認證由 `FrontJwtAuthGuard` 執行——它刻意不檢查 `@Public()`，
 * 兩者合起來才是「這支端點吃前台 token」。
 *
 * `EmailVerifiedGuard` 是第三道：聊天要求信箱已驗證。**順序有意義**——
 * 它讀的 `request.frontUser` 由 `FrontJwtAuthGuard` 設定。
 */
@MemberScoped()
@Public()
@UseGuards(FrontJwtAuthGuard, EmailVerifiedGuard)
@Controller('front/chat-rooms')
export class ChatMessageController {
  constructor(private readonly chatMessageFacade: ChatMessageFacade) {}

  @Get(':roomId/messages')
  listMessages(
    @CurrentUser() member: UserContext,
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

  /**
   * 撤回訊息。
   *
   * 走 REST 而非 WS：撤回改的是一則**已存在**的訊息，發起者拿到的是 204 而非
   * 一份新資料，不存在「哪個先到」的競爭——而 REST 的重試安全與冪等是白拿的。
   * 即時訊息流（sendMessage / syncRoom）才走 WS。
   */
  @Delete(':roomId/messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async retractMessage(
    @CurrentUser() member: UserContext,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<void> {
    await this.chatMessageFacade.retractMessage({
      roomId,
      messageId,
      memberId: member.sub,
    });
  }

  @Patch(':roomId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @CurrentUser() member: UserContext,
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
