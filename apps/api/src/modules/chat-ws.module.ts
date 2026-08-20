import { Module } from '@nestjs/common';
import { ChatGateway } from '@app/adapter/in/ws/ChatGateway';
import { SocketIoEventPublisher } from '@app/adapter/out/socketio/SocketIoEventPublisher';
import { EVENT_PUBLISHER_PORT } from '@app/application/port/out/EventPublisherPort';
import { instanceIdProvider } from '@app/infrastructure/instance-id';
import { MemberContextModule } from './member-context.module';

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
 * `EVENT_PUBLISHER_PORT` 對外 export：M2 的聊天 service 會用它送訊息，
 * 但那些 service 不該、也不需要知道 Socket.IO 的存在。
 */
@Module({
  imports: [MemberContextModule],
  providers: [
    instanceIdProvider,
    SocketIoEventPublisher,
    { provide: EVENT_PUBLISHER_PORT, useExisting: SocketIoEventPublisher },
    ChatGateway,
  ],
  exports: [EVENT_PUBLISHER_PORT],
})
export class ChatWsModule {}
