import { io, Socket } from 'socket.io-client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@app/adapter/in/ws/events';
import { resetDb, seedMember } from '../helpers/db';
import {
  signAccessToken,
  startInstance,
  type WsInstance,
} from '../helpers/ws-instance';

const PORT_A = 34_101;
const PORT_B = 34_102;
const GROUP = 'group-alpha';

/** 等待某個事件抵達，逾時即失敗——不用固定 sleep，那在慢機器上會偽陰性 */
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

/** 反覆檢查直到條件成立或逾時。用於等待「陳舊紀錄被回收」這類沒有事件可聽的狀態 */
const waitUntil = async (
  predicate: () => Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 200,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`等待條件成立逾時（${timeoutMs}ms）`);
};

/**
 * 加入群組並等待伺服器確認
 *
 * 不用 `emitWithAck`：handler 沒有回傳值，ack callback 永遠不會被呼叫，
 * 該 Promise 會一直掛著直到測試逾時——症狀是「卡 60 秒然後 timeout」，
 * 看起來像廣播壞了，實際上根本沒送出去。
 */
const joinGroup = async (socket: Socket, groupId: string): Promise<void> => {
  const joined = waitForEvent(socket, SERVER_EVENTS.GROUP_JOINED);
  socket.emit(CLIENT_EVENTS.JOIN_GROUP, { groupId });
  await joined;
};

const connect = async (url: string, token: string): Promise<Socket> => {
  const socket = io(`${url}/chat`, {
    transports: ['websocket'],
    auth: { token },
    reconnection: false,
  });
  await waitForEvent(socket, SERVER_EVENTS.CONNECTED);
  return socket;
};

/**
 * 跨實例的 WebSocket 行為
 *
 * **這是 M1 的驗收。** 前一版專案跑了很久都證明不了這件事——它的 presence 存在
 * 行程記憶體、也沒裝 redis-adapter，開第二個實例後兩邊就失聯了，
 * 而單一實例內的測試永遠是綠的。
 *
 * 因此本測試刻意起「兩個真的 NestJS 實例」而非兩個 namespace 或兩個 socket：
 * 只有跨行程才會經過 Redis pub/sub 那條路徑。
 */
describe('WebSocket 跨實例（整合）', () => {
  let instanceA: WsInstance;
  let instanceB: WsInstance;
  let prisma: PrismaService;
  let memberId: string;
  let token: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    instanceA = await startInstance(PORT_A);
    instanceB = await startInstance(PORT_B);
    prisma = instanceA.prisma;

    await resetDb(prisma);
    const seeded = await seedMember(prisma, {
      email: 'ws@example.com',
      password: 'Passw0rd!',
    });
    memberId = seeded.memberId;
    token = signAccessToken(instanceA.jwt, memberId);
  });

  afterEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    // 斷線後 presence 的清理是非同步的。不等它清乾淨，下一支測試的
    // 「目前有幾條連線」就會被上一支的殘留污染——這類污染的症狀是
    // 間歇性失敗，而且順序一換就變一個樣
    await waitUntil(
      async () =>
        (await instanceA.presence.getConnections(memberId)).length === 0,
    ).catch(() => undefined);
  });

  afterAll(async () => {
    await instanceA?.close();
    await instanceB?.close();
  });

  /** 連上指定實例並登記以便清理 */
  const connectTo = async (instance: WsInstance): Promise<Socket> => {
    const socket = await connect(instance.url, token);
    sockets.push(socket);
    return socket;
  };

  describe('認證', () => {
    it('未帶 token → 收到錯誤並被斷線', async () => {
      const socket = io(`${instanceA.url}/chat`, {
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);

      const error = await waitForEvent<{ code: string }>(
        socket,
        SERVER_EVENTS.ERROR,
      );
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('token 放在 query string → 不被採信', async () => {
      // query 會出現在伺服器日誌、瀏覽器歷史與 Referer header 中
      const socket = io(`${instanceA.url}/chat?token=${token}`, {
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);

      const error = await waitForEvent<{ code: string }>(
        socket,
        SERVER_EVENTS.ERROR,
      );
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('有效 token → 連線成功', async () => {
      const socket = await connectTo(instanceA);
      expect(socket.connected).toBe(true);
    });
  });

  // ⭐ 本 change 存在的理由
  describe('跨實例廣播', () => {
    it('A 實例送出的群組事件，B 實例的連線收得到', async () => {
      const socketA = await connectTo(instanceA);
      const socketB = await connectTo(instanceB);

      await Promise.all([joinGroup(socketA, GROUP), joinGroup(socketB, GROUP)]);

      const received = waitForEvent<{ text: string }>(socketB, 'testBroadcast');
      instanceA.publisher.publishToGroup(GROUP, 'testBroadcast', {
        text: '跨實例',
      });

      await expect(received).resolves.toEqual({ text: '跨實例' });
    });

    it('送給某成員 → 該成員在另一實例上的連線也收得到', async () => {
      await connectTo(instanceA);
      const socketB = await connectTo(instanceB);

      const received = waitForEvent<{ n: number }>(socketB, 'testPersonal');
      instanceA.publisher.publishToMember(memberId, 'testPersonal', { n: 1 });

      await expect(received).resolves.toEqual({ n: 1 });
    });

    it('未加入群組的連線收不到該群組的事件', async () => {
      const socketA = await connectTo(instanceA);
      const socketB = await connectTo(instanceB);

      await joinGroup(socketA, GROUP);

      const leaked = jest.fn();
      socketB.on('testIsolation', leaked);
      const delivered = waitForEvent(socketA, 'testIsolation');
      instanceA.publisher.publishToGroup(GROUP, 'testIsolation', {});

      await delivered;
      expect(leaked).not.toHaveBeenCalled();
    });
  });

  describe('在線狀態', () => {
    it('兩實例各查一次，看到的連線集合相同', async () => {
      await connectTo(instanceA);
      await connectTo(instanceB);

      await waitUntil(
        async () =>
          (await instanceA.presence.getConnections(memberId)).length === 2,
      );

      const fromA = await instanceA.presence.getConnections(memberId);
      const fromB = await instanceB.presence.getConnections(memberId);
      expect(fromA.map((c) => c.socketId).sort()).toEqual(
        fromB.map((c) => c.socketId).sort(),
      );
      // 兩條連線分屬不同實例，因此 instanceId 必須是兩個不同的值
      expect(new Set(fromA.map((c) => c.instanceId)).size).toBe(2);
    });

    // presence 是自建的，可能與 Socket.IO 實際持有的連線漂移。
    // adapter 的 fetchSockets() 是跨實例的真實情況，拿它當基準比對
    it('presence 與 adapter 實際持有的連線一致', async () => {
      await connectTo(instanceA);
      await connectTo(instanceB);

      await waitUntil(
        async () =>
          (await instanceA.presence.getConnections(memberId)).length === 2,
      );

      const presenceIds = (await instanceA.presence.getConnections(memberId))
        .map((c) => c.socketId)
        .sort();

      // fetchSockets() 經 redis-adapter 會列出**所有實例**上的連線，
      // 是「實際情況」最可靠的來源
      const server = instanceA.eventPublisher.boundServer;
      expect(server).not.toBeNull();
      const adapterSockets = await server!.fetchSockets();

      expect(adapterSockets.map((s) => s.id).sort()).toEqual(presenceIds);
    });

    it('正常斷線 → 該連線從 presence 消失', async () => {
      const socketA = await connectTo(instanceA);
      await waitUntil(
        async () =>
          (await instanceA.presence.getConnections(memberId)).length === 1,
      );

      socketA.disconnect();

      await waitUntil(
        async () =>
          (await instanceA.presence.getConnections(memberId)).length === 0,
      );
    });
  });

  // 這是選擇「帶時間戳的 Hash」而非「Set」的全部理由：
  // 實例非正常終止時，它留下的紀錄必須在沒有任何協調機制的情況下自動失效
  describe('實例非正常終止留下的紀錄', () => {
    /**
     * 直接寫入一筆「沒有任何實例會續期」的紀錄
     *
     * 這才是實例死亡後的真實狀態。**不用「關掉第三個實例」來模擬**——
     * 整合測試的所有實例跑在同一個 Node process，關閉 HTTP server 仍會觸發
     * Socket.IO 的 disconnect 事件，`handleDisconnect` 照樣把紀錄清乾淨，
     * 於是測到的是「正常清理」而不是「陳舊回收」。實測過：kill 後連線數立刻歸零，
     * 完全沒有經過陳舊判定那條路徑。
     */
    it('無人續期的紀錄在數個心跳週期內失效', async () => {
      await instanceA.presence.markOnline(
        memberId,
        'phantom-instance',
        'phantom-socket',
      );
      expect(await instanceA.presence.isOnline(memberId)).toBe(true);

      // 心跳 1 秒 × 陳舊倍數 2 = 2 秒（見 setup-env.integration.ts）
      await waitUntil(
        async () => !(await instanceA.presence.isOnline(memberId)),
        10_000,
      );
    });

    it('另一實例仍在續期的連線不受影響', async () => {
      const socket = await connectTo(instanceB);
      await instanceA.presence.markOnline(
        memberId,
        'phantom-instance',
        'phantom-socket',
      );

      // 幽靈紀錄消失，但 B 實例持續續期的那條還在
      await waitUntil(async () => {
        const conns = await instanceA.presence.getConnections(memberId);
        return conns.length === 1 && conns[0].instanceId !== 'phantom-instance';
      }, 10_000);
      expect(socket.connected).toBe(true);
    });
  });
});
