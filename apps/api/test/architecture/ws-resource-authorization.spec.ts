import { WS_RESOURCE_ACCESS_EXEMPTIONS } from './allowlist';
import { collectSourceFiles, readSource, toRelative } from './helpers';
import {
  calledUseCases,
  useCaseFields,
  wsHandlersOf,
  type WsHandler,
} from './ws-source';

/**
 * handler 是否把客戶端提供的識別碼直接餵給 socket 操作。
 *
 * 兩個條件都要成立才算「碰資源」：payload 上取出了某個 `*Id`，而且它進了
 * `join` / `leave` / `to` / `in` / `emit`。只看其中一邊都會失準——
 * 心跳事件也 emit，但沒有客戶端提供的識別碼；純轉譯的 handler 可能讀 payload
 * 卻不碰 socket room。
 */
const SOCKET_OPS = /\.(join|leave|to|in|emit)\(/;

const touchesClientResource = (body: string): boolean => {
  const usesPayloadId =
    /\b(?:payload|body|data|dto)\.\w*[Ii]d\b/.test(body) ||
    /const\s*\{[^}]*\w*[Ii]d[^}]*\}\s*=\s*(?:payload|body|data|dto)\b/.test(
      body,
    );
  return usesPayloadId && SOCKET_OPS.test(body);
};

/** 單一 gateway 原始碼的判定結果 */
type WsAudit = { unguarded: WsHandler[]; checked: number };

/**
 * 判定一份 gateway 原始碼中，哪些事件 handler 拿客戶端給的識別碼直接操作 socket。
 *
 * 抽成吃字串的純函式，讓這支守則自己能被合成輸入測試——
 * 給出偽陰性的守則比沒有守則更危險，它會讓人停止人工檢查。
 */
export const auditWsResourceAccess = (source: string): WsAudit => {
  const fields = useCaseFields(source);
  const unguarded: WsHandler[] = [];
  let checked = 0;

  for (const handler of wsHandlersOf(source)) {
    if (!touchesClientResource(handler.body)) continue;

    checked += 1;
    if (calledUseCases(handler, fields).length === 0) unguarded.push(handler);
  }

  return { unguarded, checked };
};

/**
 * 接受資源識別碼的 WebSocket 事件，必須經 application 層取得授權判斷。
 *
 * 這是 HTTP 端「接受任意資源識別碼的端點必須表態授權」的 WebSocket 版本。
 *
 * M1 的 `joinGroup` 直接把連線加入客戶端指定的任意 group，而它**通過了當時全部
 * 86 條守則**——`authorization-coverage` 只掃 `*Controller.ts`，而且它問的是
 * 「handler 有沒有表態認證」，`@WsAuthenticated()` 表態了。連線層的認證回答的是
 * 「你是誰」，不是「你可以碰哪些資源」；把前者當成後者，就是本專案發生過的附件 IDOR
 * 的同一個形狀。
 */
describe('架構守則：WS 事件的資源存取必須經授權判斷', () => {
  const gateways = collectSourceFiles(['src/adapter/in/ws'], {
    exclude: ['.spec.ts'],
  }).filter((file) => file.endsWith('Gateway.ts'));

  const isExempt = (file: string, handler: WsHandler): boolean =>
    WS_RESOURCE_ACCESS_EXEMPTIONS.some(
      (exemption) =>
        exemption.file === toRelative(file) &&
        handler.body.includes(exemption.snippet),
    );

  it('掃描範圍有效', () => {
    expect(gateways.length).toBeGreaterThan(0);
    expect(
      gateways.flatMap((f) => wsHandlersOf(readSource(f))).length,
    ).toBeGreaterThan(0);
  });

  it('拿客戶端識別碼操作 socket 的 handler 必須呼叫 use case', () => {
    const unguarded: string[] = [];
    let checked = 0;

    for (const file of gateways) {
      const audit = auditWsResourceAccess(readSource(file));
      checked += audit.checked;
      unguarded.push(
        ...audit.unguarded
          .filter((handler) => !isExempt(file, handler))
          .map((h) => `  ${toRelative(file)}:${h.line}  ${h.name}()`),
      );
    }

    // 專案一定有收資源識別碼的 WS 事件；掃到 0 個代表切割邏輯失效，規則會空轉
    expect(checked).toBeGreaterThan(0);

    expect(
      unguarded.length === 0
        ? ''
        : `以下 WS handler 直接使用客戶端提供的資源識別碼操作 socket：\n${unguarded.join(
            '\n',
          )}\n連線層的認證只回答「你是誰」，不回答「你可以碰哪些資源」。\n請呼叫 application 層的 use case 取得許可後再操作；確實不需授權的請列入 allowlist 並註明理由。`,
    ).toBe('');
  });

  it('豁免清單不得有過期項目', () => {
    const live = gateways.flatMap((file) =>
      wsHandlersOf(readSource(file)).map((handler) => ({
        file: toRelative(file),
        body: handler.body,
      })),
    );

    const expired = WS_RESOURCE_ACCESS_EXEMPTIONS.filter(
      (exemption) =>
        !live.some(
          (handler) =>
            handler.file === exemption.file &&
            handler.body.includes(exemption.snippet),
        ),
    ).map((exemption) => `  ${exemption.file}  ${exemption.snippet}`);

    expect(
      expired.length === 0
        ? ''
        : `以下豁免已過期（對應的 handler 已不存在）：\n${expired.join(
            '\n',
          )}\n請從 test/architecture/allowlist.ts 移除，避免白名單無限膨脹`,
    ).toBe('');
  });

  it('每筆豁免都必須註明理由', () => {
    const noReason = WS_RESOURCE_ACCESS_EXEMPTIONS.filter(
      (exemption) => exemption.reason.trim().length === 0,
    ).map((exemption) => `  ${exemption.file}  ${exemption.snippet}`);

    expect(
      noReason.length === 0
        ? ''
        : `以下豁免沒有理由：\n${noReason.join(
            '\n',
          )}\n豁免一旦失去理由就會逐漸長大`,
    ).toBe('');
  });

  /**
   * 守則自身的測試。
   *
   * 這支規則出錯是**靜默的**——它只會少報，不會有任何徵兆。
   */
  describe('判定邏輯（合成輸入）', () => {
    const wrap = (ctor: string, handler: string): string =>
      `export class G {\n  constructor(\n${ctor}\n  ) {}\n\n${handler}\n}\n`;

    const JOIN_USE_CASE = `    @Inject(JOIN_ROOM_USE_CASE)\n    private readonly joinRoom: JoinRoomUseCase,`;
    const ONLY_PORTS = `    @Inject(PRESENCE_PORT) private readonly presence: PresencePort,`;

    it('A：直接用 payload 的識別碼 join → 攔截', () => {
      const src = wrap(
        ONLY_PORTS,
        `  @SubscribeMessage('joinRoom')\n  async handleJoin(@MessageBody() payload: R) {\n    await client.join(payload.roomId);\n  }`,
      );
      expect(auditWsResourceAccess(src).unguarded.map((h) => h.name)).toEqual([
        'handleJoin',
      ]);
    });

    it('B：先呼叫 use case 再 join → 通過', () => {
      const src = wrap(
        JOIN_USE_CASE,
        `  @SubscribeMessage('joinRoom')\n  async handleJoin(@MessageBody() payload: R) {\n    await this.joinRoom.execute(member.sub, payload.roomId);\n    await client.join(payload.roomId);\n  }`,
      );
      expect(auditWsResourceAccess(src).unguarded).toHaveLength(0);
    });

    it('C：只有註解提到授權判斷 → 仍須攔截', () => {
      const src = wrap(
        JOIN_USE_CASE,
        `  @SubscribeMessage('joinRoom')\n  async handleJoin(@MessageBody() payload: R) {\n    // 已由 this.joinRoom.execute() 驗過成員資格\n    await client.join(payload.roomId);\n  }`,
      );
      expect(auditWsResourceAccess(src).unguarded.map((h) => h.name)).toEqual([
        'handleJoin',
      ]);
    });

    it('D：payload 不含資源識別碼 → 不列入檢查', () => {
      const src = wrap(
        ONLY_PORTS,
        `  @SubscribeMessage('ping')\n  handlePing() {\n    return 'pong';\n  }`,
      );
      const audit = auditWsResourceAccess(src);
      expect(audit.checked).toBe(0);
      expect(audit.unguarded).toHaveLength(0);
    });

    it('E：呼叫的是 port 而非 use case → 仍須攔截', () => {
      // presence / eventPublisher 也是 this.x，但它們不回答「可不可以碰」
      const src = wrap(
        ONLY_PORTS,
        `  @SubscribeMessage('joinRoom')\n  async handleJoin(@MessageBody() payload: R) {\n    await this.presence.touch(payload.roomId);\n    await client.join(payload.roomId);\n  }`,
      );
      expect(auditWsResourceAccess(src).unguarded.map((h) => h.name)).toEqual([
        'handleJoin',
      ]);
    });

    it('F：解構取出識別碼 → 一樣算碰資源', () => {
      const src = wrap(
        ONLY_PORTS,
        `  @SubscribeMessage('joinRoom')\n  async handleJoin(@MessageBody() payload: R) {\n    const { roomId } = payload;\n    await client.join(roomId);\n  }`,
      );
      expect(auditWsResourceAccess(src).unguarded.map((h) => h.name)).toEqual([
        'handleJoin',
      ]);
    });
  });
});
