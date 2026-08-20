import { existsSync } from 'fs';
import { WS_RATE_LIMIT_EXEMPTIONS } from './allowlist';
import { collectSourceFiles, readSource, toRelative } from './helpers';
import {
  calledUseCases,
  stripComments,
  useCaseFields,
  useCaseTypes,
  wsHandlersOf,
} from './ws-source';

/**
 * service 是否**真的呼叫**限流，而非只是注入它。
 *
 * 一開始寫成「檔案有沒有提到 RATE_LIMIT_PORT」，反向驗證時當場失效：
 * 把 `hitAndCheck()` 那行刪掉、import 與建構子注入留著，守則照樣全綠——
 * 而單元測試紅了。**宣告相依不等於使用它**，這正是重構時最容易留下的殘骸：
 * 呼叫被移除、注入忘了清，於是保護消失而沒有任何徵兆。
 */
const usesRateLimit = (source: string): boolean => {
  const clean = stripComments(source);
  const injected =
    /@Inject\(\s*\w*RATE_LIMIT_PORT\s*\)\s*(?:private|public|protected)\s+readonly\s+(\w+)\s*:/.exec(
      clean,
    );
  if (!injected) return false;
  return new RegExp(`this\\.${injected[1]}\\.\\w+\\(`).test(clean);
};

/**
 * 限流的**實作**，而非使用者。
 *
 * 用「有沒有提到 RATE_LIMIT_PORT」判斷會把消費端（送訊息的 service）也算進來，
 * 然後要求它呼叫 `getEnv()`——那是誤報，而且會誘導開發者把閾值搬到不該去的地方。
 * `implements` 才分得出「我提供限流」與「我使用限流」。
 */
const RATE_LIMIT_IMPLEMENTATION = /implements\s+\w*RateLimitPort\b/;

/**
 * 由 use case 型別名反查對應的 service 檔。
 *
 * 靠的是專案一貫的命名（`XUseCase` ↔ `XService`）。找不到檔案時**視為未表態**而非略過：
 * 誤報只是吵，漏報是靜默失效——而這條規則出錯時不會有任何徵兆。
 */
const serviceSourceOf = (useCaseType: string): string | null => {
  const base = useCaseType.replace(/UseCase$/, 'Service');
  const found = collectSourceFiles(['src/application/service'], {
    exclude: ['.spec.ts'],
  }).find((file) => file.endsWith(`/${base}.ts`));
  return found && existsSync(found) ? readSource(found) : null;
};

export type WsRateLimitStance = {
  handler: string;
  line: number;
  rateLimited: boolean;
};

/**
 * 判定一份 gateway 原始碼中，每個呼叫 use case 的 handler 是否已接限流。
 *
 * `resolveService` 由呼叫端提供（真實規則讀檔、自我測試餵合成字串），
 * 讓這支判定成為**吃字串的純函式**——給出偽陰性的守則比沒有守則更危險：
 * 它會讓人停止人工檢查，而且不會有任何徵兆。
 */
export const auditWsRateLimit = (
  source: string,
  resolveService: (useCaseType: string) => string | null,
): WsRateLimitStance[] => {
  const fields = useCaseFields(source);
  const types = useCaseTypes(source);

  return (
    wsHandlersOf(source)
      .map((handler) => ({ handler, called: calledUseCases(handler, fields) }))
      // 沒呼叫 use case 的 handler 不在範圍內：gateway 不得相依持久層（既有守則），
      // 因此「有呼叫 use case」是「會做 application 層工作」的充分代理
      .filter(({ called }) => called.length > 0)
      .map(({ handler, called }) => ({
        handler: handler.name,
        line: handler.line,
        rateLimited: called.some((field) => {
          const type = types.get(field);
          const service = type ? resolveService(type) : null;
          return service !== null && usesRateLimit(service);
        }),
      }))
  );
};

/**
 * WebSocket 事件必須表態限流。
 *
 * HTTP 端有全域 throttle middleware，**WebSocket 完全不經過它**：連線建立後的每個事件
 * 都是同一條 TCP 連線上的訊框，沒有任何一層會計次。
 *
 * 規則刻意做成「表態」而非「猜哪些會寫入」。用動詞前綴（Send / Create / Update…）判斷
 * 寫入型 use case，看起來夠用，但 `ToggleReactionUseCase` 這種命名就會靜默漏掉——
 * 那正是本專案已經發生過三次的形狀：**規則本身沒錯，只是看不見新東西**
 * （`layering` 只掃 `*Controller.ts`、`authorization-coverage` 看不到 WS、
 * `includes()` 分不出使用與提及）。表態式規則沒有這個失效面：
 * 新 handler 只要呼叫 use case 就必須做決定，決定「不需要」也要寫下理由。
 */
describe('架構守則：WS 事件必須表態限流', () => {
  const gateways = collectSourceFiles(['src/adapter/in/ws'], {
    exclude: ['.spec.ts'],
  }).filter((file) => file.endsWith('Gateway.ts'));

  const isExempt = (file: string, handler: string): boolean =>
    WS_RATE_LIMIT_EXEMPTIONS.some(
      (exemption) =>
        exemption.file === toRelative(file) && exemption.snippet === handler,
    );

  /** 全部 gateway 的判定結果，附上檔案路徑供報錯定位 */
  const audit = (): (WsRateLimitStance & { file: string })[] =>
    gateways.flatMap((file) =>
      auditWsRateLimit(readSource(file), serviceSourceOf).map((stance) => ({
        ...stance,
        file: toRelative(file),
      })),
    );

  it('掃描範圍有效', () => {
    expect(gateways.length).toBeGreaterThan(0);
    // 掃到 0 個代表切割或 use case 解析失效，規則會空轉
    expect(audit().length).toBeGreaterThan(0);
  });

  it('呼叫 use case 的 handler 必須接限流或明示豁免', () => {
    const missing = audit()
      .filter((entry) => !entry.rateLimited)
      .filter((entry) => !isExempt(entry.file, entry.handler))
      .map((entry) => `  ${entry.file}:${entry.line}  ${entry.handler}()`);

    expect(
      missing.length === 0
        ? ''
        : `以下 WS handler 未表態限流：\n${missing.join(
            '\n',
          )}\nWebSocket 不經過 HTTP 的全域 throttle，沒有任何一層會計次。\n請讓它的 service 相依限流 port；確實不需要的請列入 allowlist 並註明理由。`,
    ).toBe('');
  });

  it('限流閾值不得寫死在程式碼中', () => {
    const implementations = collectSourceFiles(
      ['src/application/service', 'src/adapter/out'],
      { exclude: ['.spec.ts'] },
    ).filter((file) =>
      RATE_LIMIT_IMPLEMENTATION.test(stripComments(readSource(file))),
    );

    // 掃到 0 個實作代表判定失效（例如 port 改名），規則會靜默空轉
    expect(implementations.length).toBeGreaterThan(0);

    const hardcoded = implementations
      .filter((file) => !stripComments(readSource(file)).includes('getEnv('))
      .map((file) => `  ${toRelative(file)}`);

    expect(
      hardcoded.length === 0
        ? ''
        : `以下限流實作沒有從 getEnv() 取閾值：\n${hardcoded.join(
            '\n',
          )}\n為了調一個數字而改程式碼、重新部署，最後的結果是沒有人去調。閾值請進 validate-env.ts 的 envSchema。`,
    ).toBe('');
  });

  it('豁免清單不得有過期項目', () => {
    const live = new Set(
      gateways.flatMap((file) =>
        wsHandlersOf(readSource(file)).map(
          (handler) => `${toRelative(file)}::${handler.name}`,
        ),
      ),
    );

    const expired = WS_RATE_LIMIT_EXEMPTIONS.filter(
      (exemption) => !live.has(`${exemption.file}::${exemption.snippet}`),
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
    const noReason = WS_RATE_LIMIT_EXEMPTIONS.filter(
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
    const gateway = (ctor: string, handler: string): string =>
      `export class G {\n  constructor(\n${ctor}\n  ) {}\n\n${handler}\n}\n`;

    const SEND_UC = `    @Inject(SEND_MESSAGE_USE_CASE)\n    private readonly sendMessage: SendMessageUseCase,`;
    const SEND_HANDLER = `  @SubscribeMessage('sendMessage')\n  async handleSend(@MessageBody() payload: R) {\n    await this.sendMessage.execute(payload);\n  }`;

    const limitedService = `@Inject(MESSAGE_RATE_LIMIT_PORT)\n    private readonly rateLimit: MessageRateLimitPort,\n  ) {}\n  async execute() { await this.rateLimit.hitAndCheck(a, b); }`;
    const plainService = `export class SendMessageService {}`;

    it('A：service 沒接限流 port → 抓出', () => {
      const result = auditWsRateLimit(
        gateway(SEND_UC, SEND_HANDLER),
        () => plainService,
      );
      expect(result.map((r) => [r.handler, r.rateLimited])).toEqual([
        ['handleSend', false],
      ]);
    });

    it('B：service 相依限流 port → 通過', () => {
      const result = auditWsRateLimit(
        gateway(SEND_UC, SEND_HANDLER),
        () => limitedService,
      );
      expect(result[0].rateLimited).toBe(true);
    });

    it('C：只有註解提到限流 port → 仍須抓出', () => {
      const commented = `// 限流由 MESSAGE_RATE_LIMIT_PORT 負責\nexport class SendMessageService {}`;
      const result = auditWsRateLimit(
        gateway(SEND_UC, SEND_HANDLER),
        () => commented,
      );
      expect(result[0].rateLimited).toBe(false);
    });

    it('D：handler 沒呼叫任何 use case → 不列入檢查', () => {
      const result = auditWsRateLimit(
        gateway(
          `    @Inject(PRESENCE_PORT) private readonly presence: PresencePort,`,
          `  @SubscribeMessage('ping')\n  handlePing() {\n    return 'pong';\n  }`,
        ),
        () => limitedService,
      );
      expect(result).toHaveLength(0);
    });

    it('E：找不到對應的 service 檔 → 視為未表態，不得靜默略過', () => {
      const result = auditWsRateLimit(
        gateway(SEND_UC, SEND_HANDLER),
        () => null,
      );
      expect(result[0].rateLimited).toBe(false);
    });

    it('H：注入了限流 port 卻沒呼叫 → 視為未表態', () => {
      const injectedButUnused = `@Inject(MESSAGE_RATE_LIMIT_PORT)\n    private readonly rateLimit: MessageRateLimitPort,\n  ) {}\n  async execute() { await this.repo.append(); }`;
      const result = auditWsRateLimit(
        gateway(SEND_UC, SEND_HANDLER),
        () => injectedButUnused,
      );
      expect(result[0].rateLimited).toBe(false);
    });

    it('G：只使用限流 port 的 service 不算實作（不得要求它讀 getEnv）', () => {
      const consumer = `import { MESSAGE_RATE_LIMIT_PORT } from '…';\nexport class SendMessageService {}`;
      const implementation = `export class RedisMessageRateLimitAdapter implements MessageRateLimitPort {}`;
      expect(RATE_LIMIT_IMPLEMENTATION.test(consumer)).toBe(false);
      expect(RATE_LIMIT_IMPLEMENTATION.test(implementation)).toBe(true);
    });

    it('F：handler 呼叫多個 use case，其一有限流即算表態', () => {
      const twoUseCases = `${SEND_UC}\n    @Inject(ENSURE_ROOM_MEMBERSHIP_USE_CASE)\n    private readonly ensureRoomMembership: EnsureRoomMembershipUseCase,`;
      const handler = `  @SubscribeMessage('sendMessage')\n  async handleSend(@MessageBody() payload: R) {\n    await this.ensureRoomMembership.execute(a, b);\n    await this.sendMessage.execute(payload);\n  }`;
      const result = auditWsRateLimit(gateway(twoUseCases, handler), (type) =>
        type === 'SendMessageUseCase' ? limitedService : plainService,
      );
      expect(result[0].rateLimited).toBe(true);
    });
  });
});
