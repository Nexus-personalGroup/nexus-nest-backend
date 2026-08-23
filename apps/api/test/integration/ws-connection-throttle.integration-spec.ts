import { randomUUID } from 'crypto';
import { io, Socket } from 'socket.io-client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@app/adapter/in/ws/events';
import { resetDb, seedUser } from '../helpers/db';
import {
  signAccessToken,
  startInstance,
  type WsInstance,
} from '../helpers/ws-instance';

const PORT = 34_401;

/** 與 setup-env.integration 的 WS_CONNECTION_EVENT_LIMIT 對齊 */
const EVENT_LIMIT = 30;
/** 與 setup-env.integration 的 WS_CONNECTION_EVENT_WINDOW_SEC 對齊（毫秒） */
const WINDOW_MS = 1_000;

interface WsError {
  code: string;
  message: string;
}

const waitForEvent = <T>(
  socket: Socket,
  event: string,
  timeoutMs = 5_000,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`等待事件 "${event}" 逾時（${timeoutMs}ms）`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const connect = async (token: string): Promise<Socket> => {
  const socket = io(`http://127.0.0.1:${PORT}/chat`, {
    transports: ['websocket'],
    auth: { token },
    reconnection: false,
  });
  await waitForEvent(socket, SERVER_EVENTS.CONNECTED);
  return socket;
};

/**
 * 連線層事件限流（整合）。
 *
 * 單元測試驗的是計數邏輯；這裡驗的是**它真的接在事件路徑上**——
 * guard 有沒有掛上、例外有沒有走到 filter、被擋下的事件有沒有真的沒執行。
 * 這三件事沒有一件是單元測試看得到的。
 */
describe('WebSocket 連線層限流（整合）', () => {
  let instance: WsInstance;
  let prisma: PrismaService;
  const sockets: Socket[] = [];

  let memberId = '';
  let token = '';
  let roomId = '';

  beforeAll(async () => {
    instance = await startInstance(PORT);
    prisma = instance.prisma;
  });

  afterAll(async () => {
    await instance?.close();
  });

  afterEach(() => {
    sockets.splice(0).forEach((s) => s.disconnect());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const member = await seedUser(prisma, {
      email: 'throttle@example.com',
      password: 'Passw0rd!',
    });
    const other = await seedUser(prisma, {
      email: 'other@example.com',
      password: 'Passw0rd!',
    });
    memberId = member.userId;
    token = signAccessToken(instance.jwt, memberId);

    const room = await prisma.chatRoomRecord.create({
      data: {
        roomType: 'GROUP',
        name: '限流測試房間',
        members: { create: [{ memberId }, { memberId: other.userId }] },
      },
    });
    roomId = room.id;
  });

  const open = async (): Promise<Socket> => {
    const socket = await connect(token);
    sockets.push(socket);
    return socket;
  };

  /** 把一條連線的額度用完，不等待回應——這正是失控客戶端的行為 */
  const exhaust = (socket: Socket): void => {
    for (let i = 0; i < EVENT_LIMIT; i += 1) {
      socket.emit(CLIENT_EVENTS.PING);
    }
  };

  it('超過門檻 → WS_RATE_LIMITED，且連線仍在', async () => {
    const socket = await open();
    exhaust(socket);

    const failure = waitForEvent<WsError>(socket, SERVER_EVENTS.ERROR);
    socket.emit(CLIENT_EVENTS.PING);

    expect((await failure).code).toBe('WS_RATE_LIMITED');
    expect(socket.connected).toBe(true);
  });

  /**
   * 計數單位是連線，不是成員也不是 IP。
   *
   * 若寫成以 memberId 為鍵，同一人的第二個裝置會共用額度——症狀是
   * 「手機在用時電腦連不上」，而那種症狀不會有人聯想到限流。
   */
  it('⭐ 兩條連線各自計數，一條被擋不影響另一條', async () => {
    // 刻意用**同一個成員**的兩條連線：若計數鍵寫成 memberId，這支測試才會紅。
    // 用兩個不同成員的話，錯誤的實作照樣會通過
    const first = await open();
    const second = await open();

    exhaust(first);
    const failure = waitForEvent<WsError>(first, SERVER_EVENTS.ERROR);
    first.emit(CLIENT_EVENTS.PING);
    expect((await failure).code).toBe('WS_RATE_LIMITED');

    const pong = await new Promise<string>((resolve) =>
      second.emit(CLIENT_EVENTS.PING, resolve),
    );

    expect(pong).toBe('pong');
  });

  it('視窗過去後恢復正常', async () => {
    const socket = await open();
    exhaust(socket);
    const failure = waitForEvent<WsError>(socket, SERVER_EVENTS.ERROR);
    socket.emit(CLIENT_EVENTS.PING);
    await failure;

    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS + 200));

    const pong = await new Promise<string>((resolve) =>
      socket.emit(CLIENT_EVENTS.PING, resolve),
    );

    expect(pong).toBe('pong');
  });

  /**
   * `ping` 沒有豁免。
   *
   * 單次 ping 只回一個字串，看起來無害——但「無害」是就單次而言，
   * 每秒一萬個 ping 一樣會佔滿事件迴圈。這支測試釘住的是「沒有例外清單」
   * 這個決定本身：日後有人為了讓心跳不受影響而加豁免，它會變紅。
   */
  it('⭐ ping 也會被擋，沒有例外清單', async () => {
    const socket = await open();

    const failure = waitForEvent<WsError>(socket, SERVER_EVENTS.ERROR);
    for (let i = 0; i <= EVENT_LIMIT; i += 1) {
      socket.emit(CLIENT_EVENTS.PING);
    }

    expect((await failure).code).toBe('WS_RATE_LIMITED');
  });

  // guard 若是在 handler 之後才判斷，這裡會有一筆資料——限流就形同虛設
  it('被擋下的送訊息事件沒有落庫', async () => {
    const socket = await open();
    exhaust(socket);

    const failure = waitForEvent<WsError>(socket, SERVER_EVENTS.ERROR);
    socket.emit(CLIENT_EVENTS.SEND_MESSAGE, {
      roomId,
      clientMessageId: randomUUID(),
      content: '這則應該被擋下',
    });

    expect((await failure).code).toBe('WS_RATE_LIMITED');
    expect(await prisma.chatMessageRecord.count({ where: { roomId } })).toBe(0);
  });
});
