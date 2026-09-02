import { ChatGateway } from './ChatGateway';
import { getEnv } from '@app/infrastructure/validate-env';
import type {
  PresenceConnection,
  PresencePort,
} from '@app/application/port/out/presence/PresencePort';
import type { MetricsPort } from '@app/application/port/out/MetricsPort';
import type { Socket } from 'socket.io';

// 同 heartbeat spec：`@WebSocketGateway` 的裝飾器在模組載入時就讀 CORS_ORIGIN
jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: jest.fn(() => ({
    CORS_ORIGIN: 'http://localhost:5173',
    WS_MAX_CONNECTIONS_PER_MEMBER: 2,
  })),
}));

const MEMBER_ID = 'member-1';
const LIMIT = 2;

/**
 * 一份共享的 presence 狀態，`markOnline` 真的寫進去、`getConnections` 真的讀出來。
 *
 * **這裡不能用「呼叫幾次」的 mock**：要驗的是「寫入後回讀」這個順序造成的結果，
 * 而那只有在讀寫共用同一份狀態時才會顯現。
 */
const makePresence = (existing: PresenceConnection[]) => {
  const state = [...existing];
  const presence = {
    getConnections: jest.fn(() => Promise.resolve([...state])),
    markOnline: jest.fn(
      (memberId: string, instanceId: string, socketId: string) => {
        state.push({ instanceId, socketId, lastSeenAt: 1_000 });
        return Promise.resolve(state.length === 1);
      },
    ),
    markOffline: jest.fn((_m: string, instanceId: string, socketId: string) => {
      const i = state.findIndex(
        (c) => c.instanceId === instanceId && c.socketId === socketId,
      );
      if (i >= 0) state.splice(i, 1);
      return Promise.resolve(state.length === 0);
    }),
  } as unknown as PresencePort;
  return { presence, state };
};

const makeGateway = (presence: PresencePort, instanceId = 'instance-a') => {
  const empty = {} as never;
  const resolveUserContext = {
    resolve: jest.fn(() =>
      Promise.resolve({
        sub: MEMBER_ID,
        email: 'u@test.com',
        emailVerified: true,
      }),
    ),
  } as never;
  const metrics = {
    setConnections: jest.fn(),
  } as unknown as jest.Mocked<MetricsPort>;

  return new ChatGateway(
    resolveUserContext,
    presence,
    empty,
    empty,
    empty,
    empty,
    instanceId,
    metrics,
    empty,
  );
};

const makeSocket = (id: string): Socket & { emitted: unknown[] } => {
  const emitted: unknown[] = [];
  return {
    id,
    handshake: { auth: { token: 'token' }, headers: {} },
    join: jest.fn(() => Promise.resolve()),
    leave: jest.fn(() => Promise.resolve()),
    emit: jest.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload });
      return true;
    }),
    disconnect: jest.fn(),
    emitted,
  } as unknown as Socket & { emitted: unknown[] };
};

const wasRejected = (socket: Socket & { emitted: unknown[] }): boolean =>
  socket.emitted.some(
    (e) =>
      (e as { payload?: { code?: string } }).payload?.code ===
      'TOO_MANY_CONNECTIONS',
  );

const conn = (
  socketId: string,
  lastSeenAt: number,
  instanceId = 'instance-a',
): PresenceConnection => ({ instanceId, socketId, lastSeenAt });

describe('ChatGateway 連線數上限', () => {
  beforeEach(() => {
    jest.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: 'http://localhost:5173',
      WS_MAX_CONNECTIONS_PER_MEMBER: LIMIT,
    } as unknown as ReturnType<typeof getEnv>);
  });

  it('未達上限時連線成功', async () => {
    const { presence, state } = makePresence([conn('old', 100)]);
    const gateway = makeGateway(presence);
    const socket = makeSocket('new');

    await gateway.handleConnection(socket);

    expect(wasRejected(socket)).toBe(false);
    expect(state).toHaveLength(2);
  });

  /**
   * ⭐ 本次修正的核心。
   *
   * 舊寫法先讀後寫，兩條同時進來會**都看到 1 條**（未達上限 2）而都通過，
   * 結果是 3 條連線。改成寫入後回讀之後，第二條會發現自己排在第 3 位而撤退。
   */
  it('⭐ 名額只剩一個時兩條同時進來——恰好拒一條，不是兩條都拒', async () => {
    const { presence, state } = makePresence([conn('old', 100)]);
    const gateway = makeGateway(presence);
    const first = makeSocket('a');
    const second = makeSocket('b');

    // 兩條都先通過預先檢查（各自看到 1 條），再依序寫入——這就是 TOCTOU 的形狀
    await gateway.handleConnection(first);
    await gateway.handleConnection(second);

    const rejected = [first, second].filter(wasRejected);
    expect(rejected).toHaveLength(1);
    expect(state).toHaveLength(LIMIT);
  });

  it('已達上限時在快路徑就被拒（不寫入）', async () => {
    const { presence, state } = makePresence([conn('a', 100), conn('b', 200)]);
    const gateway = makeGateway(presence);
    const socket = makeSocket('c');

    await gateway.handleConnection(socket);

    expect(wasRejected(socket)).toBe(true);
    expect(presence.markOnline).not.toHaveBeenCalled();
    expect(state.some((c) => c.socketId === 'c')).toBe(false);
  });

  /**
   * ⭐ 走到回滾路徑的唯一情境：**預先檢查通過，但寫入期間別人插隊**。
   *
   * 上一支被快路徑攔下，`markOnline` 根本沒跑——那驗不到「撤銷自己剛寫的那筆」。
   * 這裡讓 `markOnline` 之後憑空多出一條別人的連線來製造那個窗口。
   *
   * 沒有回滾的話，被拒的這條會佔著名額直到 TTL 過期，
   * 讓後續的**合法**連線被誤拒——而且看不出原因。
   */
  it('⭐ 寫入後才發現超額時，必須撤掉自己剛寫的那筆', async () => {
    const { presence, state } = makePresence([conn('a', 100)]);
    const original = presence.markOnline.bind(presence);
    (presence as { markOnline: unknown }).markOnline = jest.fn(
      async (m: string, i: string, sid: string) => {
        const result = await original(m, i, sid);
        // 另一條連線在這個窗口內完成寫入，**且比我們早一點**——
        // 它晚於我們的話超額的就是它而不是我們，那驗不到回滾
        state.push(conn('intruder', 999, 'instance-z'));
        return result;
      },
    );
    const gateway = makeGateway(presence);
    const socket = makeSocket('mine');

    await gateway.handleConnection(socket);

    expect(wasRejected(socket)).toBe(true);
    expect(state.some((c) => c.socketId === 'mine')).toBe(false);
    expect(socket.leave).toHaveBeenCalled();
  });

  /**
   * ⭐ 排名判定的語意——**直接呼叫，不走 handleConnection**。
   *
   * 循序呼叫 `handleConnection` 驗不到這件事：第一條寫完就回讀了，
   * 此時「總數」與「自己的名次」給出同樣的答案。**真正的 TOCTOU 是交錯的**
   * ——兩條都先寫入，然後才各自回讀。那個狀態只能直接建構出來。
   *
   * 這一組把上限的語意釘死：三條連線、上限 2 → **恰好最後一條被判超額**。
   * 寫成 `ordered.length > limit` 的話三條全部會被判超額（該拒一條變成拒三條）。
   */
  describe('排名判定（超額的是誰）', () => {
    const THREE = [conn('aaa', 1_000), conn('bbb', 1_000), conn('ccc', 1_000)];

    const verdictsFor = async (
      connections: PresenceConnection[],
    ): Promise<boolean[]> => {
      const presence = {
        getConnections: jest.fn(() => Promise.resolve([...connections])),
      } as unknown as PresencePort;
      const gateway = makeGateway(presence);
      return Promise.all(
        connections.map((c) =>
          (
            gateway as unknown as {
              exceedsLimitAfterWrite: (
                m: string,
                s: string,
                l: number,
              ) => Promise<boolean>;
            }
          ).exceedsLimitAfterWrite(MEMBER_ID, c.socketId, LIMIT),
        ),
      );
    };

    it('⭐ 三條連線、上限 2 → 恰好一條被判超額', async () => {
      expect(await verdictsFor(THREE)).toEqual([false, false, true]);
    });

    /**
     * ⭐ Redis hash 的欄位順序不保證，**不同實例讀同一份狀態可能拿到不同順序**。
     * 沒有字串次鍵時，同毫秒寫入的連線在兩個實例上會排出不同名次——
     * 結果是兩條互相禮讓（少一條）或兩條都認為自己合格（多一條）。
     */
    it('⭐ 回傳順序相反時，每一條的判定必須完全相同', async () => {
      const forward = await verdictsFor(THREE);
      const reversed = await verdictsFor([...THREE].reverse());

      // reversed 的輸入順序相反，所以判定陣列也要反過來比
      expect([...reversed].reverse()).toEqual(forward);
    });
  });

  /**
   * 回讀查不到自己代表結果不可信（Redis 降級、欄位被 sweep 清掉）。
   * **此時放行**——拒絕會讓一次 Redis 抖動變成全體連不上。
   */
  it('回讀找不到自身紀錄時放行，不拒絕', async () => {
    const presence = {
      getConnections: jest.fn(() =>
        Promise.resolve([] as PresenceConnection[]),
      ),
      markOnline: jest.fn(() => Promise.resolve(true)),
      markOffline: jest.fn(() => Promise.resolve(true)),
    } as unknown as PresencePort;
    const gateway = makeGateway(presence);
    const socket = makeSocket('lonely');

    await gateway.handleConnection(socket);

    expect(wasRejected(socket)).toBe(false);
  });
});
