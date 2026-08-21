import {
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { SocketIoEventPublisher } from '@app/adapter/out/socketio/SocketIoEventPublisher';
import {
  RESOLVE_MEMBER_CONTEXT_USE_CASE,
  ResolveMemberContextUseCase,
} from '@app/application/port/in/shared/ResolveMemberContextUseCase';
import {
  METRICS_PORT,
  MetricsPort,
} from '@app/application/port/out/MetricsPort';
import {
  JOIN_ROOM_USE_CASE,
  JoinRoomUseCase,
} from '@app/application/port/in/shared/JoinRoomUseCase';
import {
  SEND_MESSAGE_USE_CASE,
  SendMessageUseCase,
} from '@app/application/port/in/shared/SendMessageUseCase';
import {
  SYNC_ROOM_USE_CASE,
  SyncRoomUseCase,
} from '@app/application/port/in/shared/SyncRoomUseCase';
import {
  PRESENCE_PORT,
  PresencePort,
} from '@app/application/port/out/presence/PresencePort';
import { MemberContext } from '@app/application/port/member-context';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { getEnv } from '@app/infrastructure/validate-env';
import { INSTANCE_ID } from '@app/infrastructure/instance-id';
import { WsAuthenticated } from './decorator/ws-auth.decorator';
import { WsExceptionFilter } from './WsExceptionFilter';
import { ConnectionThrottle } from './ConnectionThrottle';
import { ConnectionThrottleGuard } from './ConnectionThrottleGuard';
import { CLIENT_EVENTS, SERVER_EVENTS, personalRoom } from './events';
import {
  RoomMembershipRequest,
  roomMembershipSchema,
} from './RoomMembershipRequest';
import { SendMessageRequest, sendMessageSchema } from './SendMessageRequest';
import { SyncRoomRequest, syncRoomSchema } from './SyncRoomRequest';

/** 已完成認證的連線。member 由 `handleConnection` 保證設定 */
export interface AuthenticatedSocket extends Socket {
  member: MemberContext;
}

/**
 * 聊天連線的進入點
 *
 * 只做三件事：驗證 payload、呼叫 application 層、把結果轉成回應。
 * **業務規則、速率限制、狀態判斷都不在這裡**——前一版專案的 gateway 長到 544 行，
 * 起因不是疏忽，而是當時沒有任何規則會擋下第一次違規。現在有了
 * （`layering.spec.ts` 與 `authorization-coverage.spec.ts` 都涵蓋 `*Gateway.ts`）。
 *
 * `transports: ['websocket']` 跳過 Socket.IO 預設的 HTTP long-polling 升級流程：
 * 本服務沒有需要相容舊瀏覽器的情境，多一段升級只是多一組失敗模式。
 */
@WebSocketGateway({
  namespace: '/chat',
  transports: ['websocket'],
  cors: { origin: getEnv().CORS_ORIGIN.split(','), credentials: true },
})
@WsAuthenticated()
@UseGuards(ConnectionThrottleGuard)
@UseFilters(WsExceptionFilter)
export class ChatGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(ChatGateway.name);

  /**
   * 本實例持有的連線：socketId → memberId
   *
   * **這不是在線狀態的真相來源**——真相在 Redis（見 `PresencePort`）。
   * 它的用途只有一個：知道「本實例該為哪些連線續期」。任何實例都不可能
   * 替別的實例的連線送心跳，所以這份清單必然是本地的，且必然只涵蓋自己。
   *
   * 前一版專案的錯誤是把這種本地 Map **當成 presence 本身**，
   * 於是第二個實例上線後兩邊的在線名單各說各話。
   */
  private readonly ownedSockets = new Map<string, string>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(RESOLVE_MEMBER_CONTEXT_USE_CASE)
    private readonly resolveMemberContext: ResolveMemberContextUseCase,
    @Inject(PRESENCE_PORT) private readonly presence: PresencePort,
    @Inject(JOIN_ROOM_USE_CASE)
    private readonly joinRoom: JoinRoomUseCase,
    @Inject(SEND_MESSAGE_USE_CASE)
    private readonly sendMessage: SendMessageUseCase,
    @Inject(SYNC_ROOM_USE_CASE)
    private readonly syncRoom: SyncRoomUseCase,
    private readonly eventPublisher: SocketIoEventPublisher,
    @Inject(INSTANCE_ID) private readonly instanceId: string,
    @Inject(METRICS_PORT) private readonly metrics: MetricsPort,
    private readonly connectionThrottle: ConnectionThrottle,
  ) {}

  /**
   * Socket.IO 的 namespace 建立完成
   *
   * 它由 NestJS 的 WebSocket 層建立，DI 建構階段拿不到，因此在此交給
   * event publisher——那是 application 層對外送事件的唯一出口。
   */
  afterInit(namespace: Namespace): void {
    // gateway 宣告了 namespace，因此這裡拿到的是 Namespace 而非根 Server。
    // 兩者的 to()/emit()/fetchSockets() 介面相同，但 Namespace 沒有 of()
    this.eventPublisher.bind(namespace);
  }

  onModuleInit(): void {
    const intervalMs = getEnv().WS_HEARTBEAT_INTERVAL * 1000;
    // 單一計時器輪詢本實例的所有連線，而非每條連線各開一個 timer——
    // 後者在數千連線時會產生數千個計時器，排程開銷遠大於一次批次續期
    this.heartbeatTimer = setInterval(
      () => void this.sendHeartbeats(),
      intervalMs,
    );
    this.logger.log(
      `WebSocket gateway 已啟動（instanceId=${this.instanceId}，心跳 ${getEnv().WS_HEARTBEAT_INTERVAL}s）`,
    );
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  /** 為本實例持有的所有連線續期。單條失敗不影響其他連線 */
  private async sendHeartbeats(): Promise<void> {
    // 連線數在心跳時一併更新：ownedSockets 是本實例持有的連線，
    // 而 Prometheus 依 scrape target 自動帶實例標籤——此處不要自己加 instanceId，
    // 否則實例重啟會產生一條新的時間序列，舊的永遠停在最後一個值
    this.metrics.setConnections(this.ownedSockets.size);

    for (const [socketId, memberId] of this.ownedSockets) {
      try {
        await this.presence.heartbeat(memberId, this.instanceId, socketId);
      } catch (error) {
        this.logger.warn(
          `心跳失敗 socketId=${socketId}: ${
            error instanceof Error ? error.message : '未知錯誤'
          }`,
        );
      }
    }
  }

  /**
   * 連線建立時完成認證
   *
   * 認證放在連線階段而非每個事件：連線本身是長期存在的資源，讓未認證的連線
   * 先掛著再逐事件檢查，等於把判斷散落到每個 handler，漏一個就是漏洞。
   *
   * @param client - 尚未認證的連線
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.rejectConnection(client, 'UNAUTHORIZED', '缺少授權憑證');
        return;
      }

      const member = await this.resolveMemberContext.resolve(token);
      (client as AuthenticatedSocket).member = member;

      const connections = await this.presence.getConnections(member.sub);
      if (connections.length >= getEnv().WS_MAX_CONNECTIONS_PER_MEMBER) {
        this.rejectConnection(client, 'TOO_MANY_CONNECTIONS', '連線數已達上限');
        return;
      }

      // 個人房間讓「送給某成員的所有裝置」可以直接對房間廣播，
      // 不必先查連線清單，且天然具備跨實例能力
      await client.join(personalRoom(member.sub));

      const wasOffline = await this.presence.markOnline(
        member.sub,
        this.instanceId,
        client.id,
      );
      this.ownedSockets.set(client.id, member.sub);

      client.emit(SERVER_EVENTS.CONNECTED, {
        memberId: member.sub,
        email: member.email,
      });
      this.logger.log(
        `連線建立: memberId=${member.sub} socketId=${client.id} 新上線=${wasOffline}`,
      );
    } catch (error) {
      // 認證失敗一律以同一種形狀回覆並斷線，不洩漏是哪一段判定失敗
      this.logger.warn(
        `連線認證失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
      );
      this.rejectConnection(client, 'UNAUTHORIZED', '認證失敗');
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    // 放在 early return 之前：未通過認證的連線同樣進過 guard 而留下計數器，
    // 只清「認得的」連線就是把清理綁在一個不相干的條件上
    this.connectionThrottle.release(client.id);

    const memberId = this.ownedSockets.get(client.id);
    if (!memberId) return;

    this.ownedSockets.delete(client.id);
    try {
      const nowOffline = await this.presence.markOffline(
        memberId,
        this.instanceId,
        client.id,
      );
      this.logger.log(
        `連線關閉: memberId=${memberId} socketId=${client.id} 已離線=${nowOffline}`,
      );
    } catch (error) {
      // Redis 不可用時清不掉紀錄，但那筆紀錄會因為停止續期而自動陳舊——
      // 這正是選擇「帶時間戳的 Hash」而非「Set」換來的容錯
      this.logger.warn(
        `離線標記失敗 socketId=${client.id}: ${
          error instanceof Error ? error.message : '未知錯誤'
        }`,
      );
    }
  }

  /**
   * 把這條連線加入某房間的 socket room。
   *
   * **先取得授權再操作 socket。** 少了這一步，任何已認證使用者都能拿任意 roomId
   * 加入房間並收到其全部廣播——連線層的認證回答的是「你是誰」，
   * 不是「你可以碰哪些資源」。判斷本身在 application 層：它是業務規則，
   * 而 REST 的離開房間用的是同一個判斷。
   */
  @SubscribeMessage(CLIENT_EVENTS.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody(new ZodValidationPipe(roomMembershipSchema))
    payload: RoomMembershipRequest,
  ): Promise<void> {
    // 用 JoinRoomUseCase 而非 EnsureRoomMembership：後者是唯讀判斷、送訊息與補齊
    // 都會呼叫它，在那裡記稽核等於每則訊息都寫一筆
    await this.joinRoom.execute(client.member.sub, payload.roomId);
    await client.join(payload.roomId);
    client.emit(SERVER_EVENTS.ROOM_JOINED, { roomId: payload.roomId });
  }

  /**
   * 把這條連線移出某房間的 socket room。
   *
   * 不驗成員資格：對一個本來就沒加入的 socket room 執行離開是無害的無操作，
   * 而驗證反而會讓「已被移出房間的人無法離開」。這筆豁免登記在
   * `test/architecture/allowlist.ts`。
   */
  @SubscribeMessage(CLIENT_EVENTS.LEAVE_ROOM)
  async handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody(new ZodValidationPipe(roomMembershipSchema))
    payload: RoomMembershipRequest,
  ): Promise<void> {
    await client.leave(payload.roomId);
    client.emit(SERVER_EVENTS.ROOM_LEFT, { roomId: payload.roomId });
  }

  /**
   * 送出訊息。
   *
   * **ack 一定在 use case 完成之後才送。** 樂觀回覆（先 ack 再寫）在寫入失敗時
   * 會讓使用者看到一則實際不存在的訊息，而且沒有回頭修正的機會——
   * 客戶端已經把它畫在畫面上了。
   *
   * 廣播由 service 經 `EventPublisherPort` 送出，這裡不碰 Socket.IO 的房間 API：
   * 「送給誰」是業務判斷，「怎麼送到」才是傳輸細節。
   */
  @SubscribeMessage(CLIENT_EVENTS.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody(new ZodValidationPipe(sendMessageSchema))
    payload: SendMessageRequest,
  ): Promise<void> {
    const message = await this.sendMessage.execute({
      roomId: payload.roomId,
      senderId: client.member.sub,
      content: payload.content,
      clientMessageId: payload.clientMessageId,
    });

    // ack 帶回 clientMessageId，讓客戶端把它對應到自己樂觀顯示的那一則。
    // 重送時這裡回的是首次寫入的結果，因此「重送」與「首次送出」對客戶端一致
    client.emit(SERVER_EVENTS.MESSAGE_ACK, {
      clientMessageId: payload.clientMessageId,
      messageId: message.messageId,
      seq: message.seq,
      createdAt: message.createdAt,
    });
  }

  /**
   * 斷線補齊：回傳客戶端 `lastSeq` 之後的訊息。
   *
   * 只回給提出要求的那條連線，不廣播——其他人沒有漏接。
   */
  @SubscribeMessage(CLIENT_EVENTS.SYNC_ROOM)
  async handleSyncRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody(new ZodValidationPipe(syncRoomSchema))
    payload: SyncRoomRequest,
  ): Promise<void> {
    const result = await this.syncRoom.execute({
      roomId: payload.roomId,
      memberId: client.member.sub,
      lastSeq: payload.lastSeq,
    });

    client.emit(SERVER_EVENTS.ROOM_SYNCED, result);
  }

  /** 連線活性探測。回傳值走 Socket.IO 的 ack callback，供測試客戶端確認往返正常 */
  @SubscribeMessage(CLIENT_EVENTS.PING)
  handlePing(): string {
    return 'pong';
  }

  /**
   * 取出 token
   *
   * **不接受 query string**：query 會出現在伺服器日誌、瀏覽器歷史與 Referer header 中，
   * 等於把憑證寫進三個不受控的地方。
   */
  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token.length > 0) {
      return auth.token;
    }

    const header = client.handshake.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : null;
  }

  private rejectConnection(
    client: Socket,
    code: string,
    message: string,
  ): void {
    client.emit(SERVER_EVENTS.ERROR, { code, message });
    client.disconnect(true);
  }
}
