import { collectSourceFiles, readSource, toRelative } from './helpers';
import { stripComments } from './ws-source';

/** 停用帳號的 domain 動作 */
const DEACTIVATE = /\.deactivate\(/;

/** 撤銷連線的注入 token */
const REVOKE_TOKEN = 'REVOKE_MEMBER_SESSIONS_USE_CASE';

/**
 * 一份 service 是否「停用了帳號卻沒有撤銷連線」。
 *
 * 判定要求兩件事同時成立才算合格：呼叫了 `deactivate()`，**且**呼叫了撤銷。
 * 只注入不呼叫不算——與限流守則同樣的教訓：**宣告相依不等於使用它**，
 * 而重構時最容易留下的殘骸就是「呼叫被移除、注入忘了清」。
 */
export const deactivatesWithoutRevoke = (source: string): boolean => {
  const clean = stripComments(source);
  if (!DEACTIVATE.test(clean)) return false;

  const injected = new RegExp(
    `@Inject\\(\\s*${REVOKE_TOKEN}\\s*\\)\\s*(?:private|public|protected)\\s+readonly\\s+(\\w+)\\s*:`,
  ).exec(clean);
  if (!injected) return true;

  return !new RegExp(`this\\.${injected[1]}\\.\\w+\\(`).test(clean);
};

/**
 * 停用帳號的路徑必須撤銷既有連線。
 *
 * **這條規則守的是一個「每一層都正確、但沒有人負責銜接」的缺口。**
 *
 * 連線層的認證只在 handshake 執行一次，之後的事件只驗資源層級的授權
 * （房間成員資格）。帳號停用做對了、WS 認證做對了、房間授權做對了——
 * 但沒有人規定「帳號狀態變了，既有連線怎麼辦」，
 * 於是**被停權的人只要連線還開著就能繼續送訊息**。實際存在過的漏洞。
 *
 * 規則盯的是**銜接點**而非某個實作：日後多一條停用帳號的路徑（批次停用、
 * 自動風控、匯入工具），它同樣會被要求撤銷連線。
 * 這類缺口不會被任何既有規則抓到，因為每一條規則管的都是自己那一層。
 */
describe('架構守則：停用帳號必須撤銷既有連線', () => {
  const services = collectSourceFiles(['src/application/service'], {
    exclude: ['.spec.ts'],
  });

  it('掃描範圍有效', () => {
    expect(services.length).toBeGreaterThan(0);
    // 專案一定有停用帳號的路徑；掃到 0 個代表 domain 方法改名而規則沒跟上，
    // 它會就此靜默空轉
    expect(
      services.filter((file) =>
        DEACTIVATE.test(stripComments(readSource(file))),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('呼叫 deactivate() 的 service 必須撤銷連線', () => {
    const offenders = services
      .filter((file) => deactivatesWithoutRevoke(readSource(file)))
      .map((file) => `  ${toRelative(file)}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下位置停用了帳號卻沒有撤銷既有連線：\n${offenders.join(
            '\n',
          )}\n連線層的認證只在 handshake 執行一次——帳號停用之後，既有的 WebSocket 連線\n仍然可以繼續送訊息，直到它自己斷開。請呼叫 ${REVOKE_TOKEN}。`,
    ).toBe('');
  });

  /**
   * 守則自身的測試。
   *
   * 「注入了」與「真的呼叫」要分別驗：只滿足前者是重構時最容易留下的殘骸，
   * 而那種殘骸在執行期看起來完全正常——直到有人被停權卻還在發言。
   */
  describe('判定邏輯（合成輸入）', () => {
    const withRevoke = (body: string): string =>
      `export class S {\n  constructor(\n    @Inject(REVOKE_MEMBER_SESSIONS_USE_CASE)\n    private readonly revokeSessions: RevokeMemberSessionsUseCase,\n  ) {}\n\n  async execute() {\n${body}\n  }\n}`;

    it('A：停用且撤銷 → 通過', () => {
      const src = withRevoke(
        `    member.deactivate();\n    await this.revokeSessions.execute(member.id);`,
      );
      expect(deactivatesWithoutRevoke(src)).toBe(false);
    });

    it('B：停用但完全沒有撤銷 → 抓出', () => {
      const src = `export class S {\n  async execute() {\n    member.deactivate();\n  }\n}`;
      expect(deactivatesWithoutRevoke(src)).toBe(true);
    });

    // 重構時最容易留下的殘骸：呼叫被移除、注入忘了清
    it('C：注入了撤銷卻沒呼叫 → 抓出', () => {
      const src = withRevoke(`    member.deactivate();`);
      expect(deactivatesWithoutRevoke(src)).toBe(true);
    });

    it('D：沒有停用帳號的 service → 不列入檢查', () => {
      const src = `export class S {\n  async execute() {\n    member.activate();\n  }\n}`;
      expect(deactivatesWithoutRevoke(src)).toBe(false);
    });

    it('E：只有註解提到撤銷 → 仍須抓出', () => {
      const src = `export class S {\n  async execute() {\n    // 之後要呼叫 this.revokeSessions.execute()\n    member.deactivate();\n  }\n}`;
      expect(deactivatesWithoutRevoke(src)).toBe(true);
    });
  });
});
