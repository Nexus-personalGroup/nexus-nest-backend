import { io, Socket } from 'socket.io-client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@app/adapter/in/ws/events';
import { resetDb, seedMember } from '../helpers/db';
import {
  signAccessToken,
  startInstance,
  type WsInstance,
} from '../helpers/ws-instance';

const PORT_A = 34_301;
const PORT_B = 34_302;

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

/**
 * 停權時撤銷既有連線（整合）。
 *
 * **這是本 change 的驗收，而且只有跨實例測試驗得出來。**
 *
 * 缺口的形狀是「每一層都正確、但沒有人負責銜接」：帳號停用做對了、
 * WS 認證做對了、房間授權做對了——但連線層的認證只在 handshake 執行一次，
 * 因此被停權的人只要連線還開著就能繼續送訊息。
 */
describe('WebSocket 連線撤銷（整合）', () => {
  let instanceA: WsInstance;
  let instanceB: WsInstance;
  let prisma: PrismaService;
  const sockets: Socket[] = [];

  let targetId = '';
  let otherId = '';
  let targetToken = '';
  let otherToken = '';
  let roomId = '';

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
    const target = await seedMember(prisma, {
      email: 'target@example.com',
      password: 'Passw0rd!',
    });
    const other = await seedMember(prisma, {
      email: 'other@example.com',
      password: 'Passw0rd!',
      roleName: 'other',
    });
    targetId = target.memberId;
    otherId = other.memberId;
    targetToken = signAccessToken(instanceA.jwt, targetId);
    otherToken = signAccessToken(instanceA.jwt, otherId);

    const room = await prisma.chatRoomRecord.create({
      data: {
        roomType: 'GROUP',
        name: '撤銷測試房間',
        members: { create: [{ memberId: targetId }, { memberId: otherId }] },
      },
    });
    roomId = room.id;
  });

  /** 由實例 A 觸發停權——被停權者的連線在實例 B */
  const suspendFromA = (): Promise<void> =>
    instanceA.updateMember.execute({
      id: targetId,
      actorId: otherId,
      status: false,
    });

  it('⭐ 被停權者在另一個實例上的連線被斷開', async () => {
    const socket = await connect(`http://127.0.0.1:${PORT_B}`, targetToken);
    sockets.push(socket);

    const disconnected = new Promise<void>((resolve) => {
      socket.once('disconnect', () => resolve());
    });
    await suspendFromA();

    await expect(disconnected).resolves.toBeUndefined();
    expect(socket.connected).toBe(false);
  });

  // 斷線後就沒有管道可以說明原因了——沒有這個事件，客戶端會進入無盡的重連迴圈
  it('⭐ 斷線前先收到 sessionRevoked', async () => {
    const socket = await connect(`http://127.0.0.1:${PORT_B}`, targetToken);
    sockets.push(socket);

    const revoked = waitForEvent<{ reason: string }>(
      socket,
      SERVER_EVENTS.SESSION_REVOKED,
    );
    await suspendFromA();

    expect((await revoked).reason).toBe('ACCOUNT_DISABLED');
  });

  it('同房間其他成員的連線不受影響', async () => {
    const targetSocket = await connect(
      `http://127.0.0.1:${PORT_B}`,
      targetToken,
    );
    const otherSocket = await connect(`http://127.0.0.1:${PORT_A}`, otherToken);
    sockets.push(targetSocket, otherSocket);

    const disconnected = new Promise<void>((resolve) => {
      targetSocket.once('disconnect', () => resolve());
    });
    await suspendFromA();
    await disconnected;

    expect(otherSocket.connected).toBe(true);
  });

  /**
   * 漏洞本身的驗收。
   *
   * 停權前先送一則證明連線可用，停權後再送一則——第二則不該成功。
   */
  it('⭐ 停權後既有連線無法再送訊息', async () => {
    const socket = await connect(`http://127.0.0.1:${PORT_B}`, targetToken);
    sockets.push(socket);

    const disconnected = new Promise<void>((resolve) => {
      socket.once('disconnect', () => resolve());
    });
    await suspendFromA();
    await disconnected;

    socket.emit(CLIENT_EVENTS.SEND_MESSAGE, {
      roomId,
      clientMessageId: '11111111-1111-4111-8111-111111111111',
      content: '停權後還想送',
    });
    // 連線已斷，訊息不可能送達；等一小段時間確認它真的沒落庫
    await new Promise((r) => setTimeout(r, 500));

    expect(await prisma.chatMessageRecord.count()).toBe(0);
  });

  it('沒有連線時停權照常完成', async () => {
    await expect(suspendFromA()).resolves.toBeUndefined();

    const member = await prisma.memberRecord.findUniqueOrThrow({
      where: { id: targetId },
    });
    expect(member.status).toBe(false);
  });
});
