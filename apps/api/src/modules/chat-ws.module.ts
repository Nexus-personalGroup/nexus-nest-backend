import { Module } from '@nestjs/common';
import { ChatGateway } from '@app/adapter/in/ws/ChatGateway';
import { ConnectionThrottle } from '@app/adapter/in/ws/ConnectionThrottle';
import { ConnectionThrottleGuard } from '@app/adapter/in/ws/ConnectionThrottleGuard';
import { SocketIoEventPublisher } from '@app/adapter/out/socketio/SocketIoEventPublisher';
import { EVENT_PUBLISHER_PORT } from '@app/application/port/out/EventPublisherPort';
import { instanceIdProvider } from '@app/infrastructure/instance-id';
import { RedisMessageRateLimitAdapter } from '@app/adapter/out/redis/RedisMessageRateLimitAdapter';
import { MESSAGE_RATE_LIMIT_PORT } from '@app/application/port/out/MessageRateLimitPort';
import { SEND_MESSAGE_USE_CASE } from '@app/application/port/in/shared/SendMessageUseCase';
import { SYNC_ROOM_USE_CASE } from '@app/application/port/in/shared/SyncRoomUseCase';
import { REVOKE_MEMBER_SESSIONS_USE_CASE } from '@app/application/port/in/shared/RevokeMemberSessionsUseCase';
import { SendMessageService } from '@app/application/service/shared/SendMessageService';
import { SyncRoomService } from '@app/application/service/shared/SyncRoomService';
import { RevokeMemberSessionsService } from '@app/application/service/shared/RevokeMemberSessionsService';
import { FrontAuthModule } from './front/auth.module';
import { ChatRoomCoreModule } from './chat-room-core.module';
import { MetricsModule } from './metrics.module';

/**
 * WebSocket 連線層
 *
 * 不分 admin / front 側：聊天 WS 只服務終端使用者，後台的即時儀表板走 SSE 不走 WS。
 * 因此它是與兩側平行的第三個 in 側，而非其下的子目錄。
 *
 * 連線認證所需的 `ResolveUserContextUseCase` 來自 `FrontAuthModule`——
 * 前台 HTTP 的 `FrontJwtAuthGuard` 也拿同一份實作。
 * 這正是「判定邏輯只有一份」在 DI 層面的落實方式。
 * **連線的身分是前台使用者**：聊天是前台的功能，後台帳號沒有理由出現在聊天室裡。
 *
 * `EVENT_PUBLISHER_PORT` 對外 export：聊天 service 用它送訊息，
 * 但那些 service 不該、也不需要知道 Socket.IO 的存在。
 *
 * `REVOKE_MEMBER_SESSIONS_USE_CASE` 也放這裡：它只做「對個人房間廣播再斷線」，
 * 除了 `EVENT_PUBLISHER_PORT` 之外什麼都不碰——那是傳輸層的操作，
 * 不屬於任何一側的帳號模組。放這裡讓兩個停權入口拿到的是**同一份實作**，
 * 而不是兩份會各自漂移的複製品。
 *
 * 房間的成員資格判斷來自 `ChatRoomCoreModule`——與 REST 的離開房間同一份實作。
 * 該模組刻意不相依本模組，否則兩者會互相 import。
 */
@Module({
  imports: [FrontAuthModule, ChatRoomCoreModule, MetricsModule],
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
    {
      provide: REVOKE_MEMBER_SESSIONS_USE_CASE,
      useClass: RevokeMemberSessionsService,
    },
    { provide: EVENT_PUBLISHER_PORT, useExisting: SocketIoEventPublisher },
    // 連線層限流的計數在記憶體，必須是單例——每條連線的計數器都在這一份裡
    ConnectionThrottle,
    ConnectionThrottleGuard,
    ChatGateway,
  ],
  exports: [EVENT_PUBLISHER_PORT, REVOKE_MEMBER_SESSIONS_USE_CASE],
})
export class ChatWsModule {}
