import { Module } from '@nestjs/common';
import { ChatGateway } from '@app/adapter/in/ws/ChatGateway';
import { ConnectionThrottle } from '@app/adapter/in/ws/ConnectionThrottle';
import { ConnectionThrottleGuard } from '@app/adapter/in/ws/ConnectionThrottleGuard';
import { instanceIdProvider } from '@app/infrastructure/instance-id';
import { RedisMessageRateLimitAdapter } from '@app/adapter/out/redis/RedisMessageRateLimitAdapter';
import { MESSAGE_RATE_LIMIT_PORT } from '@app/application/port/out/MessageRateLimitPort';
import { SEND_MESSAGE_USE_CASE } from '@app/application/port/in/shared/SendMessageUseCase';
import { SYNC_ROOM_USE_CASE } from '@app/application/port/in/shared/SyncRoomUseCase';
import { SendMessageService } from '@app/application/service/shared/SendMessageService';
import { SyncRoomService } from '@app/application/service/shared/SyncRoomService';
import { FrontAuthModule } from './front/auth.module';
import { ChatRoomCoreModule } from './chat-room-core.module';
import { MetricsModule } from './metrics.module';
import { EventPublisherModule } from './event-publisher.module';

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
 * `EVENT_PUBLISHER_PORT` 來自 `EventPublisherModule`：聊天 service 用它送訊息，
 * 但那些 service 不該、也不需要知道 Socket.IO 的存在。
 *
 * **本模組是連線層，不是「什麼都放這裡」的地方。** 撤銷連線的 use case 曾經住在這裡，
 * 結果是三個 admin 帳號模組為了「停權要踢掉連線」而 import 整個 gateway 與連線限流。
 * 它已移到 `SessionRevocationModule`，而該模組只相依 `EventPublisherModule`。
 * `src/modules/admin/` 不得 import 本模組，由架構守則盯著。
 *
 * 房間的成員資格判斷來自 `ChatRoomCoreModule`——與 REST 的離開房間同一份實作。
 * 該模組刻意不相依本模組，否則兩者會互相 import。
 */
@Module({
  imports: [
    FrontAuthModule,
    ChatRoomCoreModule,
    MetricsModule,
    EventPublisherModule,
  ],
  providers: [
    instanceIdProvider,
    RedisMessageRateLimitAdapter,
    {
      provide: MESSAGE_RATE_LIMIT_PORT,
      useExisting: RedisMessageRateLimitAdapter,
    },
    // 送訊息放這裡而非 ChatRoomCoreModule：它要廣播，而 core 刻意不相依本模組
    { provide: SEND_MESSAGE_USE_CASE, useClass: SendMessageService },
    { provide: SYNC_ROOM_USE_CASE, useClass: SyncRoomService },
    // 連線層限流的計數在記憶體，必須是單例——每條連線的計數器都在這一份裡
    ConnectionThrottle,
    ConnectionThrottleGuard,
    ChatGateway,
  ],
  // **不 export 任何東西。** 本模組只被 AppModule 引用（為了註冊 gateway），
  // 沒有人需要從它拿 provider。
  // 另外 Nest **不允許 re-export 自己沒有 provide 的 token**——
  // `EVENT_PUBLISHER_PORT` 現在來自 EventPublisherModule，寫進 exports 會在啟動時炸
  // 「cannot export a provider that is not part of the currently processed module」。
  // 那個錯誤 typecheck / lint / build / 單元測試全都抓不到，只有 e2e 會紅。
  exports: [],
})
export class ChatWsModule {}
