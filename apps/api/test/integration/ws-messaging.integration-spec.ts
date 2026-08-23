import { randomUUID } from 'crypto';
import { io, Socket } from 'socket.io-client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@app/adapter/in/ws/events';
import { SYNC_BATCH_LIMIT } from '@app/application/service/shared/SyncRoomService';
import { resetDb, seedMember, seedUser } from '../helpers/db';
import {
  signAccessToken,
  signAdminAccessToken,
  startInstance,
  type WsInstance,
} from '../helpers/ws-instance';

const PORT_A = 34_201;
const PORT_B = 34_202;

type Ack = {
  clientMessageId: string;
  messageId: string;
  seq: number;
  createdAt: string;
};

type Created = { messageId: string; seq: number; content: string };

type Synced = { roomId: string; messages: Created[]; hasMore: boolean };

type WsError = { code: string; message: string };

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

const connect = async (url: string, token: string): Promise<Socket> => {
  const socket = io(`${url}/chat`, {
    transports: ['websocket'],
    auth: { token },
    reconnection: false,
  });
  await waitForEvent(socket, SERVER_EVENTS.CONNECTED);
  return socket;
};

const joinRoom = async (socket: Socket, roomId: string): Promise<void> => {
  const joined = waitForEvent(socket, SERVER_EVENTS.ROOM_JOINED);
  socket.emit(CLIENT_EVENTS.JOIN_ROOM, { roomId });
  await joined;
};

/**
 * 等待「屬於這個 clientMessageId」的 ack。
 *
 * **不能用 `socket.once`。** 併發送出時會先註冊 N 個一次性監聽器，而第一個 ack
 * 抵達就會把它們全部觸發——於是每個 Promise 都拿到同一份 ack，`Promise.all`
 * 在其餘寫入還沒完成時就返回。實際踩過：症狀是「序號重複」與「lastSeq 停在 1」，
 * 看起來完全像是配號的實作壞了，但配號是對的。
 */
const waitForAck = (
  socket: Socket,
  clientMessageId: string,
  timeoutMs = 5_000,
): Promise<Ack> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(SERVER_EVENTS.MESSAGE_ACK, onAck);
      socket.off(SERVER_EVENTS.ERROR, onError);
      reject(new Error(`等待 ack（${clientMessageId}）逾時`));
    }, timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off(SERVER_EVENTS.MESSAGE_ACK, onAck);
      socket.off(SERVER_EVENTS.ERROR, onError);
    };

    const onAck = (payload: Ack): void => {
      if (payload.clientMessageId !== clientMessageId) return;
      cleanup();
      resolve(payload);
    };

    // 也監聽 error：沒有這段的話，任何送出失敗都只會表現成「等 ack 逾時」，
    // 而逾時訊息裡沒有任何線索指向真正的原因
    const onError = (payload: WsError): void => {
      cleanup();
      reject(new Error(`送出失敗：${payload.code} ${payload.message}`));
    };

    socket.on(SERVER_EVENTS.MESSAGE_ACK, onAck);
    socket.on(SERVER_EVENTS.ERROR, onError);
  });

/**
 * 送一則訊息並等它自己的 ack。
 *
 * `clientMessageId` 可指定，用於驗證重送——重送的定義就是「沿用同一個 ID」。
 */
const sendMessage = async (
  socket: Socket,
  roomId: string,
  content: string,
  clientMessageId = randomUUID(),
): Promise<Ack> => {
  const acked = waitForAck(socket, clientMessageId);
  socket.emit(CLIENT_EVENTS.SEND_MESSAGE, {
    roomId,
    clientMessageId,
    content,
  });
  return acked;
};

/**
 * 訊息的跨實例行為（整合）
 *
 * **這是本 change 的驗收。** 三件事只有在真的跨行程時才驗得出來：
 * 序號在併發下不重號、重送不產生第二則、廣播送得到另一個實例上的連線。
 * 單一實例內的測試對這三件事永遠是綠的。
 */
describe('WebSocket 訊息（整合）', () => {
  let instanceA: WsInstance;
  let instanceB: WsInstance;
  let prisma: PrismaService;
  const sockets: Socket[] = [];

  let idA = '';
  let idB = '';
  let tokenA = '';
  let tokenB = '';
  let roomId = '';

  const connectA = async (): Promise<Socket> => {
    const socket = await connect(`http://127.0.0.1:${PORT_A}`, tokenA);
    sockets.push(socket);
    return socket;
  };

  const connectB = async (): Promise<Socket> => {
    const socket = await connect(`http://127.0.0.1:${PORT_B}`, tokenB);
    sockets.push(socket);
    return socket;
  };

  beforeAll(async () => {
    instanceA = await startInstance(PORT_A);
    instanceB = await startInstance(PORT_B);
    prisma = instanceA.prisma;
  });

  afterAll(async () => {
    await instanceA?.close();
    await instanceB?.close();
  });

  afterEach(() => {
    sockets.splice(0).forEach((s) => s.disconnect());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const a = await seedUser(prisma, {
      email: 'a@example.com',
      password: 'Passw0rd!',
    });
    const b = await seedUser(prisma, {
      email: 'b@example.com',
      password: 'Passw0rd!',
    });
    idA = a.userId;
    idB = b.userId;
    tokenA = signAccessToken(instanceA.jwt, idA);
    tokenB = signAccessToken(instanceA.jwt, idB);

    const room = await prisma.chatRoomRecord.create({
      data: {
        roomType: 'GROUP',
        name: '整合測試房間',
        members: { create: [{ memberId: idA }, { memberId: idB }] },
      },
    });
    roomId = room.id;
  });

  /**
   * **連線的身分是前台使用者。**
   *
   * `migrate-chat-to-front-users` 之前，這條連線用的是後台帳號的 token 而且會成功。
   * 之後必須被拒——擋下它的不是權限判斷，而是兩側各自的 secret：
   * 後台簽出的 token 在 handshake 的簽章驗證就過不了。
   */
  describe('⭐ 連線的身分', () => {
    it('後台 token 建立連線 → 被拒並斷線', async () => {
      const admin = await seedMember(prisma, {
        email: 'admin@example.com',
        password: 'Passw0rd!',
      });
      const socket = io(`http://127.0.0.1:${PORT_A}/chat`, {
        transports: ['websocket'],
        auth: { token: signAdminAccessToken(instanceA.jwt, admin.memberId) },
        reconnection: false,
      });
      sockets.push(socket);

      const failure = await waitForEvent<WsError>(socket, SERVER_EVENTS.ERROR);

      expect(failure.code).toBe('UNAUTHORIZED');
      // 拒絕不是「不回應」——連線必須真的被斷開，否則它會一直掛著
      await new Promise<void>((resolve) => {
        if (!socket.connected) return resolve();
        socket.once('disconnect', () => resolve());
      });
      expect(socket.connected).toBe(false);
    });
  });

  describe('送收', () => {
    it('A 實例送出的訊息，B 實例的連線收得到，且 seq 一致', async () => {
      const socketA = await connectA();
      const socketB = await connectB();
      await joinRoom(socketA, roomId);
      await joinRoom(socketB, roomId);

      const received = waitForEvent<Created>(
        socketB,
        SERVER_EVENTS.MESSAGE_CREATED,
      );
      const ack = await sendMessage(socketA, roomId, '午餐吃什麼');
      const broadcast = await received;

      expect(broadcast.content).toBe('午餐吃什麼');
      expect(broadcast.messageId).toBe(ack.messageId);
      expect(broadcast.seq).toBe(ack.seq);
    });

    it('送出者自己也收得到廣播，且與 ack 是同一則', async () => {
      const socketA = await connectA();
      await joinRoom(socketA, roomId);

      const received = waitForEvent<Created>(
        socketA,
        SERVER_EVENTS.MESSAGE_CREATED,
      );
      const ack = await sendMessage(socketA, roomId, 'hi');

      expect((await received).messageId).toBe(ack.messageId);
    });

    it('非成員送訊息 → CHAT_ROOM_NOT_FOUND，且不落庫', async () => {
      const outsider = await seedUser(prisma, {
        email: 'outsider@example.com',
        password: 'Passw0rd!',
      });
      const socket = await connect(
        `http://127.0.0.1:${PORT_A}`,
        signAccessToken(instanceA.jwt, outsider.userId),
      );
      sockets.push(socket);

      const failure = waitForEvent<WsError>(socket, SERVER_EVENTS.ERROR);
      socket.emit(CLIENT_EVENTS.SEND_MESSAGE, {
        roomId,
        clientMessageId: randomUUID(),
        content: '偷聽',
      });

      expect((await failure).code).toBe('CHAT_ROOM_NOT_FOUND');
      expect(await prisma.chatMessageRecord.count()).toBe(0);
    });
  });

  describe('去重', () => {
    it('同一個 clientMessageId 送兩次 → 只有一則，兩次 ack 相同', async () => {
      const socketA = await connectA();
      const clientMessageId = randomUUID();

      const first = await sendMessage(socketA, roomId, '重試', clientMessageId);
      const second = await sendMessage(
        socketA,
        roomId,
        '重試',
        clientMessageId,
      );

      expect(second.messageId).toBe(first.messageId);
      expect(second.seq).toBe(first.seq);
      expect(await prisma.chatMessageRecord.count()).toBe(1);
    });

    // 重送若吃掉號碼，seq 會出現洞，而補齊的客戶端無法區分
    // 「這個號碼被跳過」與「我漏收了」
    it('重送不吃掉序號', async () => {
      const socketA = await connectA();
      const clientMessageId = randomUUID();

      await sendMessage(socketA, roomId, '第一則', clientMessageId);
      await sendMessage(socketA, roomId, '第一則', clientMessageId);
      const next = await sendMessage(socketA, roomId, '第二則');

      expect(next.seq).toBe(2);
      const room = await prisma.chatRoomRecord.findUniqueOrThrow({
        where: { id: roomId },
      });
      expect(room.lastSeq).toBe(2);
    });

    // 首次送出時已經廣播過；再播一次對其他成員就是重複訊息
    it('重送不重播給其他成員', async () => {
      const socketA = await connectA();
      const socketB = await connectB();
      await joinRoom(socketB, roomId);
      const clientMessageId = randomUUID();

      const firstBroadcast = waitForEvent(
        socketB,
        SERVER_EVENTS.MESSAGE_CREATED,
      );
      await sendMessage(socketA, roomId, '重試', clientMessageId);
      await firstBroadcast;

      const replayed = jest.fn();
      socketB.on(SERVER_EVENTS.MESSAGE_CREATED, replayed);
      await sendMessage(socketA, roomId, '重試', clientMessageId);
      // 廣播是非同步的；等一小段時間確認它真的沒來，而非還沒到
      await new Promise((r) => setTimeout(r, 300));

      expect(replayed).not.toHaveBeenCalled();
    });
  });

  /**
   * `seq` 的併發正確性——design.md D2 的驗收。
   *
   * 兩個實例各自送出訊息，號碼必須恰好是 1..N 且不重不漏。
   * 這是「配號與寫入放在同一個交易」唯一驗得出來的地方：
   * 分成兩步在單機低併發下也幾乎不會出錯，要跨行程搶同一列才會顯形。
   */
  describe('序號在併發下的正確性', () => {
    it('兩實例同時各送 5 則 → seq 恰好是 1..10，不重不漏', async () => {
      const socketA = await connectA();
      const socketB = await connectB();

      const acks = await Promise.all([
        ...Array.from({ length: 5 }, (_, i) =>
          sendMessage(socketA, roomId, `A-${i}`),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          sendMessage(socketB, roomId, `B-${i}`),
        ),
      ]);

      const seqs = acks.map((a) => a.seq).sort((x, y) => x - y);
      expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('房間的 lastSeq 與實際訊息數一致', async () => {
      const socketA = await connectA();
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          sendMessage(socketA, roomId, `第 ${i} 則`),
        ),
      );

      const room = await prisma.chatRoomRecord.findUniqueOrThrow({
        where: { id: roomId },
      });
      expect(room.lastSeq).toBe(5);
      expect(await prisma.chatMessageRecord.count({ where: { roomId } })).toBe(
        5,
      );
    });
  });

  describe('斷線補齊', () => {
    it('補齊斷線期間的訊息，不含已收到的', async () => {
      const socketA = await connectA();
      await joinRoom(socketA, roomId);
      const seen = await sendMessage(socketA, roomId, '斷線前');

      // 模擬斷線期間由另一個實例產生的訊息
      const socketB = await connectB();
      await sendMessage(socketB, roomId, '斷線期間 1');
      await sendMessage(socketB, roomId, '斷線期間 2');

      const synced = waitForEvent<Synced>(socketA, SERVER_EVENTS.ROOM_SYNCED);
      socketA.emit(CLIENT_EVENTS.SYNC_ROOM, { roomId, lastSeq: seen.seq });
      const result = await synced;

      expect(result.messages.map((m) => m.content)).toEqual([
        '斷線期間 1',
        '斷線期間 2',
      ]);
      expect(result.hasMore).toBe(false);
    });

    it('沒有漏接時回空陣列', async () => {
      const socketA = await connectA();
      const ack = await sendMessage(socketA, roomId, '唯一一則');

      const synced = waitForEvent<Synced>(socketA, SERVER_EVENTS.ROOM_SYNCED);
      socketA.emit(CLIENT_EVENTS.SYNC_ROOM, { roomId, lastSeq: ack.seq });

      expect((await synced).messages).toHaveLength(0);
    });

    // 沒有 hasMore，「補齊上限」會靜默地變成「丟訊息」
    it('待補訊息超過單次上限 → hasMore 為 true', async () => {
      const socketA = await connectA();
      // 直接落庫：這裡要的是「量」，走 WS 送 101 則只是讓測試變慢
      await prisma.chatMessageRecord.createMany({
        data: Array.from({ length: SYNC_BATCH_LIMIT + 1 }, (_, i) => ({
          roomId,
          senderId: idB,
          content: `第 ${i + 1} 則`,
          seq: i + 1,
          clientMessageId: `seed-${i + 1}`,
        })),
      });
      await prisma.chatRoomRecord.update({
        where: { id: roomId },
        data: { lastSeq: SYNC_BATCH_LIMIT + 1 },
      });

      const synced = waitForEvent<Synced>(socketA, SERVER_EVENTS.ROOM_SYNCED);
      socketA.emit(CLIENT_EVENTS.SYNC_ROOM, { roomId, lastSeq: 0 });
      const result = await synced;

      expect(result.messages).toHaveLength(SYNC_BATCH_LIMIT);
      expect(result.hasMore).toBe(true);
      // 從最舊開始補：補齊是接在斷點之後往前推進
      expect(result.messages[0].seq).toBe(1);
    });

    it('非成員無法補齊', async () => {
      const outsider = await seedUser(prisma, {
        email: 'outsider2@example.com',
        password: 'Passw0rd!',
      });
      const socket = await connect(
        `http://127.0.0.1:${PORT_A}`,
        signAccessToken(instanceA.jwt, outsider.userId),
      );
      sockets.push(socket);

      const failure = waitForEvent<WsError>(socket, SERVER_EVENTS.ERROR);
      socket.emit(CLIENT_EVENTS.SYNC_ROOM, { roomId, lastSeq: 0 });

      expect((await failure).code).toBe('CHAT_ROOM_NOT_FOUND');
    });
  });

  describe('限流', () => {
    /** 與 setup-env.integration 的 WS_MESSAGE_RATE_LIMIT 對齊 */
    const RATE_LIMIT = 10;

    it('超過閾值 → CHAT_MESSAGE_RATE_LIMITED，且該則沒有落庫', async () => {
      const socketA = await connectA();

      for (let i = 0; i < RATE_LIMIT; i += 1) {
        await sendMessage(socketA, roomId, `第 ${i + 1} 則`);
      }

      const failure = waitForEvent<WsError>(socketA, SERVER_EVENTS.ERROR);
      socketA.emit(CLIENT_EVENTS.SEND_MESSAGE, {
        roomId,
        clientMessageId: randomUUID(),
        content: '第四則',
      });

      expect((await failure).code).toBe('CHAT_MESSAGE_RATE_LIMITED');
      expect(await prisma.chatMessageRecord.count({ where: { roomId } })).toBe(
        RATE_LIMIT,
      );
    });

    // 計數以「成員 + 房間」為單位：同一個人在多個房間發言是正常行為
    it('另一個房間的額度不受影響', async () => {
      const other = await prisma.chatRoomRecord.create({
        data: {
          roomType: 'GROUP',
          name: '另一個房間',
          members: { create: [{ memberId: idA }] },
        },
      });
      const socketA = await connectA();

      for (let i = 0; i < RATE_LIMIT; i += 1) {
        await sendMessage(socketA, roomId, `第 ${i + 1} 則`);
      }
      const ack = await sendMessage(socketA, other.id, '另一個房間的第一則');

      expect(ack.seq).toBe(1);
    });
  });

  describe('已讀', () => {
    it('已讀前進 → 其他實例上的成員收得到 roomRead', async () => {
      const socketA = await connectA();
      await joinRoom(socketA, roomId);
      const socketB = await connectB();
      await joinRoom(socketB, roomId);
      await sendMessage(socketA, roomId, '訊息');

      const read = waitForEvent<{ memberId: string; lastReadSeq: number }>(
        socketA,
        SERVER_EVENTS.ROOM_READ,
      );
      // 由實例 B 觸發：跨實例送達才是這裡要證明的事
      await instanceB.markRoomRead.execute({
        roomId,
        memberId: idB,
        lastReadSeq: 1,
      });

      const payload = await read;
      expect(payload.memberId).toBe(idB);
      expect(payload.lastReadSeq).toBe(1);
    });
  });

  /**
   * 撤回的跨實例行為。
   *
   * 遮蔽只寫在 repository 的投影函式一處，但**讀取路徑有三條**——
   * 補齊這條在單元測試之外還要真的跑一次，因為它經過的是完整的 WS 流程。
   */
  describe('撤回', () => {
    it('撤回後，另一個實例上的成員收得到 messageRetracted', async () => {
      const socketA = await connectA();
      await joinRoom(socketA, roomId);
      const socketB = await connectB();
      await joinRoom(socketB, roomId);
      const ack = await sendMessage(socketA, roomId, '這則會被撤回');

      const retracted = waitForEvent<{ messageId: string; seq?: number }>(
        socketB,
        SERVER_EVENTS.MESSAGE_RETRACTED,
      );
      // 由實例 A 觸發，實例 B 上的連線要收得到
      await instanceA.retractMessage.execute({
        roomId,
        messageId: ack.messageId,
        memberId: idA,
      });

      expect((await retracted).messageId).toBe(ack.messageId);
    });

    // 撤回要移除的就是內容；推播帶著它等於撤了個寂寞
    it('推播的 payload 不含 content', async () => {
      const socketA = await connectA();
      await joinRoom(socketA, roomId);
      const ack = await sendMessage(socketA, roomId, '機密內容');

      const retracted = waitForEvent<Record<string, unknown>>(
        socketA,
        SERVER_EVENTS.MESSAGE_RETRACTED,
      );
      await instanceA.retractMessage.execute({
        roomId,
        messageId: ack.messageId,
        memberId: idA,
      });

      const payload = await retracted;
      expect(payload).not.toHaveProperty('content');
      expect(JSON.stringify(payload)).not.toContain('機密內容');
    });

    // 讀取路徑之三：補齊。濾掉的話 seq 會有洞，客戶端會反覆嘗試補同一段
    it('斷線期間被撤回的訊息，補齊時仍在但無內容', async () => {
      const socketA = await connectA();
      const first = await sendMessage(socketA, roomId, '第一則');
      const second = await sendMessage(socketA, roomId, '第二則機密');
      await instanceA.retractMessage.execute({
        roomId,
        messageId: second.messageId,
        memberId: idA,
      });

      const synced = waitForEvent<Synced>(socketA, SERVER_EVENTS.ROOM_SYNCED);
      socketA.emit(CLIENT_EVENTS.SYNC_ROOM, { roomId, lastSeq: 0 });
      const result = await synced;

      expect(result.messages.map((m) => m.seq)).toEqual([
        first.seq,
        second.seq,
      ]);
      const retractedMessage = result.messages[1];
      expect(retractedMessage.content).toBe('');
      expect(JSON.stringify(result)).not.toContain('第二則機密');
    });
  });

  /**
   * 行為稽核。
   *
   * 這裡驗的是**跨越完整 WS 流程**的埋點——單元測試只能證明 service 呼叫了 port，
   * 證明不了「經過 gateway、通過驗證、走完整條路之後」真的有一筆落庫。
   */
  describe('行為稽核', () => {
    const auditRows = () =>
      prisma.chatAuditLogRecord.findMany({ orderBy: { createdAt: 'asc' } });

    it('加入房間留下 ROOM_JOINED', async () => {
      const socketA = await connectA();
      await joinRoom(socketA, roomId);

      const rows = await auditRows();
      expect(rows.map((r) => r.action)).toEqual(['ROOM_JOINED']);
      expect(rows[0].memberId).toBe(idA);
      expect(rows[0].roomId).toBe(roomId);
    });

    // 判準是「證據會不會消失」——chat_messages 已經是訊息自己的紀錄
    it('送出訊息不留下稽核紀錄', async () => {
      const socketA = await connectA();
      await sendMessage(socketA, roomId, '一則訊息');

      expect(await auditRows()).toHaveLength(0);
    });

    // 被限流擋下不會留下任何其他痕跡，是洗版行為的唯一證據
    it('被限流擋下留下稽核紀錄，且該訊息沒有落庫', async () => {
      const socketA = await connectA();
      for (let i = 0; i < 10; i += 1) {
        await sendMessage(socketA, roomId, `第 ${i + 1} 則`);
      }

      const failure = waitForEvent<WsError>(socketA, SERVER_EVENTS.ERROR);
      socketA.emit(CLIENT_EVENTS.SEND_MESSAGE, {
        roomId,
        clientMessageId: randomUUID(),
        content: '被擋下的那則',
      });
      await failure;

      const rows = await auditRows();
      expect(rows.map((r) => r.action)).toEqual(['MESSAGE_RATE_LIMITED']);
      expect(await prisma.chatMessageRecord.count({ where: { roomId } })).toBe(
        10,
      );
    });

    it('稽核紀錄不含訊息內容', async () => {
      const socketA = await connectA();
      await joinRoom(socketA, roomId);
      const ack = await sendMessage(socketA, roomId, '機密的訊息內容');
      await instanceA.retractMessage.execute({
        roomId,
        messageId: ack.messageId,
        memberId: idA,
      });

      const rows = await auditRows();
      expect(JSON.stringify(rows)).not.toContain('機密的訊息內容');
    });
  });

  /**
   * 管理員移除。
   *
   * 與撤回同樣要驗跨實例，但多一件事：**移除與撤回必須是不同的事件**——
   * 共用會讓發送者以為自己撤回了。
   */
  describe('管理員移除', () => {
    it('移除後，另一個實例上的成員收得到 messageRemoved', async () => {
      const socketA = await connectA();
      await joinRoom(socketA, roomId);
      const socketB = await connectB();
      await joinRoom(socketB, roomId);
      const ack = await sendMessage(socketA, roomId, '違規內容');

      const removed = waitForEvent<{ messageId: string; seq: number }>(
        socketB,
        SERVER_EVENTS.MESSAGE_REMOVED,
      );
      await instanceA.removeMessage.execute({
        messageId: ack.messageId,
        moderatorId: idB,
      });

      const payload = await removed;
      expect(payload.messageId).toBe(ack.messageId);
      expect(payload.seq).toBe(ack.seq);
    });

    it('推播的 payload 不含 content', async () => {
      const socketA = await connectA();
      await joinRoom(socketA, roomId);
      const ack = await sendMessage(socketA, roomId, '這段不該出現在推播');

      const removed = waitForEvent<Record<string, unknown>>(
        socketA,
        SERVER_EVENTS.MESSAGE_REMOVED,
      );
      await instanceA.removeMessage.execute({
        messageId: ack.messageId,
        moderatorId: idB,
      });

      const payload = await removed;
      expect(payload).not.toHaveProperty('content');
      expect(JSON.stringify(payload)).not.toContain('這段不該出現在推播');
    });

    // 讀取路徑之一：濾掉會讓 seq 有洞，客戶端會反覆嘗試補同一段
    it('斷線期間被移除的訊息，補齊時仍在但無內容', async () => {
      const socketA = await connectA();
      const first = await sendMessage(socketA, roomId, '第一則');
      const second = await sendMessage(socketA, roomId, '第二則違規內容');
      await instanceA.removeMessage.execute({
        messageId: second.messageId,
        moderatorId: idB,
      });

      const synced = waitForEvent<Synced>(socketA, SERVER_EVENTS.ROOM_SYNCED);
      socketA.emit(CLIENT_EVENTS.SYNC_ROOM, { roomId, lastSeq: 0 });
      const result = await synced;

      expect(result.messages.map((m) => m.seq)).toEqual([
        first.seq,
        second.seq,
      ]);
      expect(result.messages[1].content).toBe('');
      expect(JSON.stringify(result)).not.toContain('第二則違規內容');
    });
  });
});
