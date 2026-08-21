import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '@app/app.module';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import { RedisIoAdapter } from '@app/infrastructure/redis-io.adapter';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  EVENT_PUBLISHER_PORT,
  EventPublisherPort,
} from '@app/application/port/out/EventPublisherPort';
import { SocketIoEventPublisher } from '@app/adapter/out/socketio/SocketIoEventPublisher';
import {
  PRESENCE_PORT,
  PresencePort,
} from '@app/application/port/out/presence/PresencePort';
import {
  LEAVE_ROOM_USE_CASE,
  LeaveRoomUseCase,
} from '@app/application/port/in/front/chat-room/LeaveRoomUseCase';
import {
  MARK_ROOM_READ_USE_CASE,
  MarkRoomReadUseCase,
} from '@app/application/port/in/front/chat-message/MarkRoomReadUseCase';
import {
  RETRACT_MESSAGE_USE_CASE,
  RetractMessageUseCase,
} from '@app/application/port/in/front/chat-message/RetractMessageUseCase';
import {
  REMOVE_MESSAGE_USE_CASE,
  RemoveMessageUseCase,
} from '@app/application/port/in/admin/moderation/MessageModerationUseCases';

export interface WsInstance {
  app: NestExpressApplication;
  port: number;
  url: string;
  publisher: EventPublisherPort;
  /** 具體實作，供測試查詢 adapter 實際持有的連線（`boundServer`） */
  eventPublisher: SocketIoEventPublisher;
  presence: PresencePort;
  /** 讓測試能從「這個實例」觸發離開房間，藉此驗證通知確實跨實例送達 */
  leaveRoom: LeaveRoomUseCase;
  /** 同上，用於已讀通知 */
  markRoomRead: MarkRoomReadUseCase;
  /** 同上，用於撤回通知 */
  retractMessage: RetractMessageUseCase;
  /** 同上，用於管理員移除的通知 */
  removeMessage: RemoveMessageUseCase;
  prisma: PrismaService;
  jwt: JwtService;
  /** 正常關閉：走 shutdown hooks，presence 會被清乾淨 */
  close: () => Promise<void>;
}

/**
 * 起一個完整的 API 實例
 *
 * 用 `NestFactory.create` 而非 `Test.createTestingModule`：後者不經過 main.ts 的
 * bootstrap 流程，`RedisIoAdapter` 就掛不上去，而那正是跨實例廣播的關鍵。
 * 這裡刻意複製 main.ts 中與 WebSocket 相關的那段，其餘（swagger、helmet…）不需要。
 *
 * @param port - 監聽埠。呼叫端負責分配，避免兩個實例互搶
 */
export const startInstance = async (port: number): Promise<WsInstance> => {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    { logger: false },
  );
  app.setGlobalPrefix('api');

  const ioAdapter = new RedisIoAdapter(app, app.get(RedisService));
  await ioAdapter.connect();
  app.useWebSocketAdapter(ioAdapter);

  app.enableShutdownHooks();
  await app.listen(port);

  return {
    app,
    port,
    url: `http://127.0.0.1:${port}`,
    publisher: app.get<EventPublisherPort>(EVENT_PUBLISHER_PORT),
    eventPublisher: app.get(SocketIoEventPublisher),
    presence: app.get<PresencePort>(PRESENCE_PORT),
    leaveRoom: app.get<LeaveRoomUseCase>(LEAVE_ROOM_USE_CASE),
    markRoomRead: app.get<MarkRoomReadUseCase>(MARK_ROOM_READ_USE_CASE),
    retractMessage: app.get<RetractMessageUseCase>(RETRACT_MESSAGE_USE_CASE),
    removeMessage: app.get<RemoveMessageUseCase>(REMOVE_MESSAGE_USE_CASE),
    prisma: app.get(PrismaService),
    jwt: app.get(JwtService),
    close: async () => {
      await app.close();
    },
  };
};

/**
 * 簽一個可用於 WebSocket 連線的 access token
 *
 * 直接簽發而非走登入 API：這支測試要驗的是 WS 層，讓它相依登入流程等於
 * 多一個與本測試無關的失敗來源。
 */
export const signAccessToken = (jwt: JwtService, memberId: string): string =>
  jwt.sign({ sub: memberId, type: 'access', tokenVersion: 0 });
