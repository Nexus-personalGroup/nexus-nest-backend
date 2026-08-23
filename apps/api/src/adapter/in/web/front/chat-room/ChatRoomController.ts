import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatRoomFacade } from '@app/application/facade/front/ChatRoomFacade';
import type { ChatRoomSummary } from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';
import type { ListMyRoomsResult } from '@app/application/port/in/front/chat-room/ListMyRoomsUseCase';
import type { UserContext } from '@app/application/port/user-context';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { CurrentUser } from '../../decorator/current-user.decorator';
import { Public } from '../../decorator/public.decorator';
import { FrontJwtAuthGuard } from '../../guard/FrontJwtAuthGuard';
import { EmailVerifiedGuard } from '../../guard/EmailVerifiedGuard';
import { MemberScoped } from '../../decorator/member-scoped.decorator';
import {
  createDirectRoomSchema,
  CreateDirectRoomRequest,
} from './CreateDirectRoomRequest';
import {
  createGroupRoomSchema,
  CreateGroupRoomRequest,
} from './CreateGroupRoomRequest';
import { listMyRoomsQuerySchema, ListMyRoomsQuery } from './ListMyRoomsQuery';

/**
 * 前台聊天室。
 *
 * 四支端點的資源範圍都由 `@CurrentUser()` 決定，沒有任何「指定他人」的入口——
 * 房間清單看自己的、離開房間離開自己的。這讓授權判斷落在
 * 「呼叫者是不是這個房間的成員」單一問題上，由 application 層回答——
 * `@MemberScoped()` 就是這個決定的宣告。
 *
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
export class ChatRoomController {
  constructor(private readonly chatRoomFacade: ChatRoomFacade) {}

  @Get()
  listMyRooms(
    @CurrentUser() member: UserContext,
    @Query(new ZodValidationPipe(listMyRoomsQuerySchema))
    query: ListMyRoomsQuery,
  ): Promise<ListMyRoomsResult> {
    return this.chatRoomFacade.listMyRooms({ memberId: member.sub, ...query });
  }

  @Post('direct')
  @HttpCode(HttpStatus.OK)
  createDirectRoom(
    @CurrentUser() member: UserContext,
    @Body(new ZodValidationPipe(createDirectRoomSchema))
    dto: CreateDirectRoomRequest,
  ): Promise<ChatRoomSummary> {
    // 回 200 而非 201：重複呼叫得到既有房間，此時沒有任何東西被建立
    return this.chatRoomFacade.createDirectRoom({
      memberId: member.sub,
      targetMemberId: dto.targetMemberId,
    });
  }

  @Post('group')
  @HttpCode(HttpStatus.CREATED)
  createGroupRoom(
    @CurrentUser() member: UserContext,
    @Body(new ZodValidationPipe(createGroupRoomSchema))
    dto: CreateGroupRoomRequest,
  ): Promise<ChatRoomSummary> {
    return this.chatRoomFacade.createGroupRoom({
      memberId: member.sub,
      name: dto.name,
      memberIds: dto.memberIds,
    });
  }

  @Delete(':roomId/members/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leaveRoom(
    @CurrentUser() member: UserContext,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ): Promise<void> {
    await this.chatRoomFacade.leaveRoom({ roomId, memberId: member.sub });
  }
}
