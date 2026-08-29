import { Logger } from '@nestjs/common';
import { ChatGateway } from './ChatGateway';
import { getEnv } from '@app/infrastructure/validate-env';
import type { PresencePort } from '@app/application/port/out/presence/PresencePort';
import type { MetricsPort } from '@app/application/port/out/MetricsPort';

// 工廠要自帶預設值：`@WebSocketGateway` 的裝飾器在**模組載入時**就呼叫 getEnv()
// 讀 CORS_ORIGIN，那比任何 beforeEach 都早
jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: jest.fn(() => ({
    CORS_ORIGIN: 'http://localhost:5173',
    WS_HEARTBEAT_INTERVAL: 15,
  })),
}));

const mockGetEnv = jest.mocked(getEnv);

const INTERVAL_SECONDS = 15;
const INTERVAL_MS = INTERVAL_SECONDS * 1000;
const INSTANCE_ID = 'instance-a';

type Renewal = { memberId: string; instanceId: string; socketId: string };

/**
 * 只餵心跳會用到的相依；其餘 port 給空物件即可。
 *
 * `heartbeat` 與 `heartbeatMany` 兩支都掛上，續期結果由 `renewals()` 合併讀取——
 * 這樣「哪些連線被續期了」這個**行為**斷言不會綁死在逐條或批次哪一種**機制**上。
 */
const makeGateway = (
  sockets: Array<[socketId: string, memberId: string]>,
  overrides: { heartbeat?: jest.Mock; heartbeatMany?: jest.Mock } = {},
) => {
  const heartbeat =
    overrides.heartbeat ?? jest.fn().mockResolvedValue(undefined);
  const heartbeatMany =
    overrides.heartbeatMany ?? jest.fn().mockResolvedValue(undefined);
  const presence = { heartbeat, heartbeatMany } as unknown as PresencePort;

  const metrics = {
    setConnections: jest.fn(),
    observeHeartbeatSeconds: jest.fn(),
    incrementHeartbeatSkipped: jest.fn(),
  } as unknown as jest.Mocked<MetricsPort>;

  const empty = {} as never;
  const gateway = new ChatGateway(
    empty,
    presence,
    empty,
    empty,
    empty,
    empty,
    INSTANCE_ID,
    metrics,
    empty,
  );

  const owned = gateway['ownedSockets'];
  sockets.forEach(([socketId, memberId]) => owned.set(socketId, memberId));

  /** 兩種機制下實際被續期的連線 */
  const renewals = (): Renewal[] => [
    ...heartbeat.mock.calls.map(
      ([memberId, instanceId, socketId]: [string, string, string]) => ({
        memberId,
        instanceId,
        socketId,
      }),
    ),
    ...heartbeatMany.mock.calls.flatMap(
      ([entries]: [Renewal[]]) => entries ?? [],
    ),
  ];

  /** 續期被觸發了幾次（逐條 N 次 / 批次 1 次） */
  const renewalCalls = (): number =>
    heartbeat.mock.calls.length + heartbeatMany.mock.calls.length;

  return { gateway, metrics, renewals, renewalCalls, heartbeat, heartbeatMany };
};

/**
 * 讓 fake timer 觸發指定輪數，並把每輪的 promise 鏈跑完。
 *
 * 用 `advanceTimersByTimeAsync` 而非 `advanceTimersByTime` +
 * `runOnlyPendingTimersAsync`：後者會讓每次呼叫觸發**兩輪**——
 * 前者先燒掉一次，而 interval 重新排程後又被 runOnlyPending 燒掉一次。
 */
const tick = async (times = 1): Promise<void> => {
  await jest.advanceTimersByTimeAsync(INTERVAL_MS * times);
};

/**
 * 心跳的續期行為。
 *
 * **這支是先於實作寫的安全網**：`sendHeartbeats()` 原本沒有任何測試，
 * 而它要被改成批次 + 防重入。沒有這組測試的話，改壞了不會有東西告訴你——
 * 症狀是「還連著的人被判定離線」，而那看起來像一個正常的答案。
 *
 * 斷言刻意寫成**機制無關**：逐條或批次都算數。
 * 這樣同一組測試在改動前後都成立，真正被守住的是行為而不是寫法。
 */
describe('ChatGateway 心跳', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetEnv.mockReturnValue({
      WS_HEARTBEAT_INTERVAL: INTERVAL_SECONDS,
    } as unknown as ReturnType<typeof getEnv>);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('每條持有的連線都被續期', async () => {
    const { gateway, renewals } = makeGateway([
      ['sock-1', 'member-1'],
      ['sock-2', 'member-2'],
    ]);

    gateway.onModuleInit();
    await tick();

    expect(renewals()).toEqual(
      expect.arrayContaining([
        { memberId: 'member-1', instanceId: INSTANCE_ID, socketId: 'sock-1' },
        { memberId: 'member-2', instanceId: INSTANCE_ID, socketId: 'sock-2' },
      ]),
    );
    expect(renewals()).toHaveLength(2);

    gateway.onModuleDestroy();
  });

  it('連線數在心跳時一併更新', async () => {
    const { gateway, metrics } = makeGateway([
      ['sock-1', 'member-1'],
      ['sock-2', 'member-2'],
    ]);

    gateway.onModuleInit();
    await tick();

    expect(metrics.setConnections).toHaveBeenCalledWith(2);

    gateway.onModuleDestroy();
  });

  it('沒有連線時不呼叫續期', async () => {
    const { gateway, renewalCalls, metrics } = makeGateway([]);

    gateway.onModuleInit();
    await tick();

    expect(renewalCalls()).toBe(0);
    expect(metrics.setConnections).toHaveBeenCalledWith(0);

    gateway.onModuleDestroy();
  });

  it('每一輪都會重新續期', async () => {
    const { gateway, renewals } = makeGateway([['sock-1', 'member-1']]);

    gateway.onModuleInit();
    await tick();
    await tick();

    expect(renewals()).toHaveLength(2);

    gateway.onModuleDestroy();
  });

  // 單輪失敗不可以把計時器弄壞——旗標沒放 finally 的話這裡會永久停擺
  it('⭐ 續期失敗後，下一輪仍然執行', async () => {
    const failing = jest
      .fn()
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValue(undefined);
    const { gateway, renewalCalls } = makeGateway([['sock-1', 'member-1']], {
      heartbeat: failing,
      heartbeatMany: failing,
    });

    gateway.onModuleInit();
    await tick();
    await tick();

    expect(renewalCalls()).toBeGreaterThanOrEqual(2);

    gateway.onModuleDestroy();
  });

  it('停止後不再續期', async () => {
    const { gateway, renewalCalls } = makeGateway([['sock-1', 'member-1']]);

    gateway.onModuleInit();
    gateway.onModuleDestroy();
    await tick();

    expect(renewalCalls()).toBe(0);
  });

  // 逐條 await 是 N 條連線 N 次往返，第 N 條要等前面跑完
  it('⭐ 整輪只送一次，不逐條往返', async () => {
    const { gateway, heartbeat, heartbeatMany } = makeGateway([
      ['sock-1', 'member-1'],
      ['sock-2', 'member-2'],
      ['sock-3', 'member-3'],
    ]);

    gateway.onModuleInit();
    await tick();

    expect(heartbeatMany).toHaveBeenCalledTimes(1);
    expect(heartbeat).not.toHaveBeenCalled();

    gateway.onModuleDestroy();
  });

  /**
   * 防重入。
   *
   * 計時器沒有 in-flight 旗標時，上一輪沒跑完下一輪照樣開始，
   * 堆疊之後只會更慢——而續期一旦落後超過連線紀錄的 TTL，
   * **還連著的人會開始被判定離線**。觸發它的是負載，
   * 也就是最不希望它出錯的時候。
   */
  describe('防重入', () => {
    /** 回傳一個卡住的 heartbeatMany 與放行它的 handle */
    const makePending = () => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { pending, release: () => release() };
    };

    it('⭐ 上一輪未完成時，後續各輪都跳過', async () => {
      const { pending, release } = makePending();
      const heartbeatMany = jest.fn().mockReturnValue(pending);
      const { gateway, metrics } = makeGateway([['sock-1', 'member-1']], {
        heartbeatMany,
      });

      gateway.onModuleInit();
      await tick();
      // 第一輪還卡著，再觸發兩輪
      await tick(2);

      expect(heartbeatMany).toHaveBeenCalledTimes(1);
      expect(metrics.incrementHeartbeatSkipped).toHaveBeenCalledTimes(2);

      release();
      gateway.onModuleDestroy();
    });

    it('⭐ 前一輪完成後恢復執行——跳過不是永久的', async () => {
      const { pending, release } = makePending();
      const heartbeatMany = jest
        .fn()
        .mockReturnValueOnce(pending)
        .mockResolvedValue(undefined);
      const { gateway } = makeGateway([['sock-1', 'member-1']], {
        heartbeatMany,
      });

      gateway.onModuleInit();
      await tick();
      await tick();
      expect(heartbeatMany).toHaveBeenCalledTimes(1);

      release();
      await Promise.resolve();
      await Promise.resolve();

      await tick();

      expect(heartbeatMany).toHaveBeenCalledTimes(2);

      gateway.onModuleDestroy();
    });

    // 旗標沒放 finally 的話，單輪拋出就會讓心跳永久停擺
    it('⭐ 整輪拋出後旗標仍被重置', async () => {
      const heartbeatMany = jest
        .fn()
        .mockRejectedValueOnce(new Error('redis down'))
        .mockResolvedValue(undefined);
      const { gateway, metrics } = makeGateway([['sock-1', 'member-1']], {
        heartbeatMany,
      });

      gateway.onModuleInit();
      await tick();
      await tick();

      expect(heartbeatMany).toHaveBeenCalledTimes(2);
      expect(metrics.incrementHeartbeatSkipped).not.toHaveBeenCalled();

      gateway.onModuleDestroy();
    });

    it('單輪耗時有指標', async () => {
      const { gateway, metrics } = makeGateway([['sock-1', 'member-1']]);

      gateway.onModuleInit();
      await tick();

      expect(metrics.observeHeartbeatSeconds).toHaveBeenCalled();

      gateway.onModuleDestroy();
    });
  });
});
