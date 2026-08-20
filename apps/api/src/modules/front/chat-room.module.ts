import { Module } from '@nestjs/common';
import { ChatRoomController } from '../../adapter/in/web/front/chat-room/ChatRoomController';
import { ChatRoomFacade } from '../../application/facade/front/ChatRoomFacade';
import { CREATE_DIRECT_ROOM_USE_CASE } from '../../application/port/in/front/chat-room/CreateDirectRoomUseCase';
import { CREATE_GROUP_ROOM_USE_CASE } from '../../application/port/in/front/chat-room/CreateGroupRoomUseCase';
import { LIST_MY_ROOMS_USE_CASE } from '../../application/port/in/front/chat-room/ListMyRoomsUseCase';
import { LEAVE_ROOM_USE_CASE } from '../../application/port/in/front/chat-room/LeaveRoomUseCase';
import { CreateDirectRoomService } from '../../application/service/front/chat-room/CreateDirectRoomService';
import { CreateGroupRoomService } from '../../application/service/front/chat-room/CreateGroupRoomService';
import { ListMyRoomsService } from '../../application/service/front/chat-room/ListMyRoomsService';
import { LeaveRoomService } from '../../application/service/front/chat-room/LeaveRoomService';
import { MemberPersistenceModule } from '../member-persistence.module';
import { ChatWsModule } from '../chat-ws.module';
import { ChatRoomCoreModule } from '../chat-room-core.module';

/**
 * 前台聊天室模組（路由 `/api/front/chat-rooms`）。
 *
 * 持久層與成員資格判斷在 `ChatRoomCoreModule`，本模組只放前台的四支端點。
 * 那個切割是為了打斷循環相依（見該模組的說明）。
 */
@Module({
  imports: [MemberPersistenceModule, ChatWsModule, ChatRoomCoreModule],
  controllers: [ChatRoomController],
  providers: [
    { provide: CREATE_DIRECT_ROOM_USE_CASE, useClass: CreateDirectRoomService },
    { provide: CREATE_GROUP_ROOM_USE_CASE, useClass: CreateGroupRoomService },
    { provide: LIST_MY_ROOMS_USE_CASE, useClass: ListMyRoomsService },
    { provide: LEAVE_ROOM_USE_CASE, useClass: LeaveRoomService },
    ChatRoomFacade,
  ],
})
export class FrontChatRoomModule {}
