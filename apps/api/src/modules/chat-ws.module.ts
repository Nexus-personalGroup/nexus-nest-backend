import { Module } from '@nestjs/common';
import { ChatGateway } from '@app/adapter/in/ws/ChatGateway';
import { SocketIoEventPublisher } from '@app/adapter/out/socketio/SocketIoEventPublisher';
import { EVENT_PUBLISHER_PORT } from '@app/application/port/out/EventPublisherPort';
import { instanceIdProvider } from '@app/infrastructure/instance-id';
import { RedisMessageRateLimitAdapter } from '@app/adapter/out/redis/RedisMessageRateLimitAdapter';
import { MESSAGE_RATE_LIMIT_PORT } from '@app/application/port/out/MessageRateLimitPort';
import { SEND_MESSAGE_USE_CASE } from '@app/application/port/in/shared/SendMessageUseCase';
import { SYNC_ROOM_USE_CASE } from '@app/application/port/in/shared/SyncRoomUseCase';
import { SendMessageService } from '@app/application/service/shared/SendMessageService';
import { SyncRoomService } from '@app/application/service/shared/SyncRoomService';
import { MemberContextModule } from './member-context.module';
import { ChatRoomCoreModule } from './chat-room-core.module';

/**
 * WebSocket 連線層
 *
 * 不分 admin / front 側：聊天 WS 只服務終端使用者，後台的即時儀表板走 SSE 不走 WS。
 * 因此它是與兩側平行的第三個 in 側，而非其下的子目錄。
 *
 * 連線認證所需的 `ResolveMemberContextUseCase` 來自 `MemberContextModule`——
 * HTTP 的 JwtAuthGuard 也 import 同一個 module，兩邊拿到的是同一份實作。
 * 這正是「判定邏輯只有一份」在 DI 層面的落實方式。
 *
 * `EVENT_PUBLISHER_PORT` 對外 export：聊天 service 用它送訊息，
 * 但那些 service 不該、也不需要知道 Socket.IO 的存在。
 *
 * 房間的成員資格判斷來自 `ChatRoomCoreModule`——與 REST 的離開房間同一份實作。
 * 該模組刻意不相依本模組，否則兩者會互相 import。
 */
@Module({
  imports: [MemberContextModule, ChatRoomCoreModule],
  providers: [
    instanceIdProvider,
    SocketIoEventPublisher,
    RedisMessageRateLimitAdapter,
    {
      provide: MESSAGE_RATE_LIMIT_PORT,
      useExisting: RedisMessageRateLimitAdapter,
    },
    // 送訊息放這裡而非 ChatRoomCoreModule：它要廣播，而 core 刻意不相依本模組
    { provide: SEND_MESSAGE_USE_CASE, useClass: SendMessageService },
    { provide: SYNC_ROOM_USE_CASE, useClass: SyncRoomService },
    { provide: EVENT_PUBLISHER_PORT, useExisting: SocketIoEventPublisher },
    ChatGateway,
  ],
  exports: [EVENT_PUBLISHER_PORT],
})
export class ChatWsModule {}
