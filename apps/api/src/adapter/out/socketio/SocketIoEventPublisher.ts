import { Injectable, Logger } from '@nestjs/common';
import { Namespace } from 'socket.io';
import { EventPublisherPort } from '@app/application/port/out/EventPublisherPort';
import { personalRoom } from '@app/adapter/in/ws/events';

/**
 * 以 Socket.IO 實作事件送出
 *
 * 跨實例的能力來自掛在 Server 上的 `@socket.io/redis-adapter`（見 `RedisIoAdapter`）：
 * `server.to(room).emit()` 會經由 Redis pub/sub 送到所有實例，
 * **呼叫端不需要知道收件者在哪個行程**。
 *
 * Server 實例由 gateway 在 `afterInit` 時注入——它由 NestJS 的 WebSocket 層建立，
 * 無法在 DI 建構階段取得。未注入前呼叫會記錄警告而非拋出：
 * 事件送不出去不該讓觸發它的業務流程整個失敗。
 */
@Injectable()
export class SocketIoEventPublisher implements EventPublisherPort {
  private readonly logger = new Logger(SocketIoEventPublisher.name);
  private server: Namespace | null = null;

  /** 由 gateway 的 `afterInit` 呼叫，把 NestJS 建立的 Server 交給本 adapter */
  bind(server: Namespace): void {
    this.server = server;
  }

  /**
   * 目前綁定的 namespace
   *
   * 供診斷用途查詢 adapter 實際持有的連線（`fetchSockets()` 會跨實例）。
   * **application 層不該用它**——那等於繞過 port 直接碰 Socket.IO。
   *
   * @returns 已綁定的 namespace；尚未就緒時為 null
   */
  get boundServer(): Namespace | null {
    return this.server;
  }

  publishToGroup(groupId: string, event: string, payload: unknown): void {
    this.emit(groupId, event, payload);
  }

  publishToMember(memberId: string, event: string, payload: unknown): void {
    this.emit(personalRoom(memberId), event, payload);
  }

  private emit(room: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(
        `WebSocket server 尚未就緒，事件未送出: room=${room} event=${event}`,
      );
      return;
    }
    this.server.to(room).emit(event, payload);
  }
}
