import { io, Socket } from 'socket.io-client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { SERVER_EVENTS } from '@app/adapter/in/ws/events';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import {
  buildPresenceKey,
  buildPresenceScanPattern,
} from '@app/infrastructure/redis/cache-keys';
import { resetDb, seedUser } from '../helpers/db';
import {
  signAccessToken,
  startInstance,
  type WsInstance,
} from '../helpers/ws-instance';

const PORT = 34_501;

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

/**
 * 在線成員索引（整合）。
 *
 * **只有真實 Redis 驗得出來**：索引是一個 Set、真相是一堆帶心跳時間的 Hash，
 * 而校正發生在 sweep 遍歷 Hash 的過程中——三者的互動用 mock 驗等於自己驗自己。
 */
describe('在線成員索引（整合）', () => {
  let instance: WsInstance;
  let prisma: PrismaService;
  let redis: RedisService;
  const sockets: Socket[] = [];

  let memberId = '';
  let otherId = '';
  let token = '';
  let otherToken = '';

  beforeAll(async () => {
    instance = await startInstance(PORT);
    prisma = instance.prisma;
    redis = instance.app.get(RedisService);
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
      email: 'presence@example.com',
      password: 'Passw0rd!',
    });
    const other = await seedUser(prisma, {
      email: 'other@example.com',
      password: 'Passw0rd!',
    });
    memberId = member.userId;
    otherId = other.userId;
    token = signAccessToken(instance.jwt, memberId);
    otherToken = signAccessToken(instance.jwt, otherId);
    // **整合測試共用同一個 Redis**（prefix `integration:`），而其他 spec 的連線
    // 在 presence key 的 TTL（60 秒）內都還算「在線」——不清乾淨的話這裡的
    // 絕對值斷言會拿到別人的連線數，而症狀是「預期 1、收到 3」這種指不到原因的失敗。
    // 先實際刪掉所有 presence key 與索引，再 sweep 讓兩者歸零
    const stale = await redis.scanKeys(
      buildPresenceScanPattern(redis.keyPrefix),
    );
    for (const key of stale) {
      await redis.del(key);
    }
    await redis.del(`${redis.keyPrefix}presence:online-members`);
    await instance.presence.sweepStale();
    expect(await instance.presence.countOnlineMembers()).toBe(0);
  });

  const connect = async (auth: string): Promise<Socket> => {
    const socket = io(`http://127.0.0.1:${PORT}/chat`, {
      transports: ['websocket'],
      auth: { token: auth },
      reconnection: false,
    });
    await waitForEvent(socket, SERVER_EVENTS.CONNECTED);
    sockets.push(socket);
    return socket;
  };

  it('連線後計入，斷線後移除', async () => {
    const socket = await connect(token);
    expect(await instance.presence.countOnlineMembers()).toBe(1);

    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(await instance.presence.countOnlineMembers()).toBe(0);
  });

  // 計數單位是「人」不是「連線」：一個人開三個分頁仍然是一個人
  it('⭐ 同一人兩條連線 → 仍算一個人', async () => {
    await connect(token);
    await connect(token);

    expect(await instance.presence.countOnlineMembers()).toBe(1);
  });

  it('兩個不同的人 → 算兩個', async () => {
    await connect(token);
    await connect(otherToken);

    expect(await instance.presence.countOnlineMembers()).toBe(2);
  });

  /**
   * **這是這個 change 唯一驗得到「漂移會被修正」的地方。**
   *
   * 實例被強制終止時 `markOffline` 永遠不會執行——連線紀錄會隨 TTL 消失，
   * 但索引裡的那個成員留著。少了 sweep 的校正，在線人數會單向累積，
   * 而且沒有任何症狀：它只是一個越來越大的數字。
   */
  it('⭐ 連線紀錄消失但沒走斷線流程（模擬實例被 kill）→ sweep 後修正', async () => {
    await connect(token);
    expect(await instance.presence.countOnlineMembers()).toBe(1);

    // 直接刪掉 presence key，不呼叫 markOffline
    await redis.del(buildPresenceKey(redis.keyPrefix, memberId));

    await instance.presence.sweepStale();

    expect(await instance.presence.countOnlineMembers()).toBe(0);
  });

  it('索引被外部清空 → sweep 後補回在線的人', async () => {
    await connect(token);
    await redis.del(`${redis.keyPrefix}presence:online-members`);
    expect(await instance.presence.countOnlineMembers()).toBe(0);

    await instance.presence.sweepStale();

    expect(await instance.presence.countOnlineMembers()).toBe(1);
  });
});
