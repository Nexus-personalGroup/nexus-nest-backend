import { Module } from '@nestjs/common';
import { ChatRoomController } from '../../adapter/in/web/front/chat-room/ChatRoomController';
import { ChatMessageController } from '../../adapter/in/web/front/chat-message/ChatMessageController';
import { ChatRoomFacade } from '../../application/facade/front/ChatRoomFacade';
import { ChatMessageFacade } from '../../application/facade/front/ChatMessageFacade';
import { CREATE_DIRECT_ROOM_USE_CASE } from '../../application/port/in/front/chat-room/CreateDirectRoomUseCase';
import { CREATE_GROUP_ROOM_USE_CASE } from '../../application/port/in/front/chat-room/CreateGroupRoomUseCase';
import { LIST_MY_ROOMS_USE_CASE } from '../../application/port/in/front/chat-room/ListMyRoomsUseCase';
import { LEAVE_ROOM_USE_CASE } from '../../application/port/in/front/chat-room/LeaveRoomUseCase';
import { CreateDirectRoomService } from '../../application/service/front/chat-room/CreateDirectRoomService';
import { CreateGroupRoomService } from '../../application/service/front/chat-room/CreateGroupRoomService';
import { ListMyRoomsService } from '../../application/service/front/chat-room/ListMyRoomsService';
import { LeaveRoomService } from '../../application/service/front/chat-room/LeaveRoomService';
import { LIST_MESSAGES_USE_CASE } from '../../application/port/in/front/chat-message/ListMessagesUseCase';
import { MARK_ROOM_READ_USE_CASE } from '../../application/port/in/front/chat-message/MarkRoomReadUseCase';
import { RETRACT_MESSAGE_USE_CASE } from '../../application/port/in/front/chat-message/RetractMessageUseCase';
import { ListMessagesService } from '../../application/service/front/chat-message/ListMessagesService';
import { MarkRoomReadService } from '../../application/service/front/chat-message/MarkRoomReadService';
import { RetractMessageService } from '../../application/service/front/chat-message/RetractMessageService';
import { PrismaChatRoomReadRepository } from '../../adapter/out/persistence/chat-message/PrismaChatRoomReadRepository';
import { CHAT_ROOM_READ_REPOSITORY_PORT } from '../../application/port/out/chat-message/ChatRoomReadRepositoryPort';
import { UserPersistenceModule } from '../user-persistence.module';
import { FrontAuthModule } from './auth.module';
import { ChatWsModule } from '../chat-ws.module';
import { ChatRoomCoreModule } from '../chat-room-core.module';
import { MetricsModule } from '../metrics.module';

/**
 * 前台聊天室模組（路由 `/api/front/chat-rooms`）。
 *
 * 持久層與成員資格判斷在 `ChatRoomCoreModule`，本模組只放前台的四支端點。
 * 那個切割是為了打斷循環相依（見該模組的說明）。
 */
@Module({
  // FrontAuthModule 提供 RESOLVE_USER_CONTEXT_USE_CASE：controller 掛的
  // FrontJwtAuthGuard 需要它。UserPersistenceModule 供建房間時檢查對方是否存在且啟用
  imports: [
    FrontAuthModule,
    UserPersistenceModule,
    ChatWsModule,
    ChatRoomCoreModule,
    MetricsModule,
  ],
  controllers: [ChatRoomController, ChatMessageController],
  providers: [
    { provide: CREATE_DIRECT_ROOM_USE_CASE, useClass: CreateDirectRoomService },
    { provide: CREATE_GROUP_ROOM_USE_CASE, useClass: CreateGroupRoomService },
    { provide: LIST_MY_ROOMS_USE_CASE, useClass: ListMyRoomsService },
    { provide: LEAVE_ROOM_USE_CASE, useClass: LeaveRoomService },
    { provide: LIST_MESSAGES_USE_CASE, useClass: ListMessagesService },
    { provide: MARK_ROOM_READ_USE_CASE, useClass: MarkRoomReadService },
    { provide: RETRACT_MESSAGE_USE_CASE, useClass: RetractMessageService },
    PrismaChatRoomReadRepository,
    {
      provide: CHAT_ROOM_READ_REPOSITORY_PORT,
      useExisting: PrismaChatRoomReadRepository,
    },
    ChatRoomFacade,
    ChatMessageFacade,
  ],
})
export class FrontChatRoomModule {}
