import {
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UseFilters,
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
  PRESENCE_PORT,
  PresencePort,
} from '@app/application/port/out/presence/PresencePort';
import { MemberContext } from '@app/application/port/member-context';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { getEnv } from '@app/infrastructure/validate-env';
import { INSTANCE_ID } from '@app/infrastructure/instance-id';
import { WsAuthenticated } from './decorator/ws-auth.decorator';
import { WsExceptionFilter } from './WsExceptionFilter';
import { CLIENT_EVENTS, SERVER_EVENTS, personalRoom } from './events';
import {
  GroupMembershipRequest,
  groupMembershipSchema,
} from './GroupMembershipRequest';

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
    private readonly eventPublisher: SocketIoEventPublisher,
    @Inject(INSTANCE_ID) private readonly instanceId: string,
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

  @SubscribeMessage(CLIENT_EVENTS.JOIN_GROUP)
  async handleJoinGroup(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody(new ZodValidationPipe(groupMembershipSchema))
    payload: GroupMembershipRequest,
  ): Promise<void> {
    await client.join(payload.groupId);
    client.emit(SERVER_EVENTS.GROUP_JOINED, { groupId: payload.groupId });
  }

  @SubscribeMessage(CLIENT_EVENTS.LEAVE_GROUP)
  async handleLeaveGroup(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody(new ZodValidationPipe(groupMembershipSchema))
    payload: GroupMembershipRequest,
  ): Promise<void> {
    await client.leave(payload.groupId);
    client.emit(SERVER_EVENTS.GROUP_LEFT, { groupId: payload.groupId });
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
