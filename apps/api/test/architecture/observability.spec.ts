import { collectSourceFiles, readSource, toRelative } from './helpers';
import { stripComments } from './ws-source';

/** 監控套件；業務層不得直接相依 */
const METRICS_PACKAGES =
  /from\s+['"](prom-client|@willsoto\/nestjs-prometheus)['"]/;

/**
 * 找出稽核 port 的注入欄位名。
 *
 * 與限流守則同樣的教訓：**宣告相依不等於使用它**，所以這裡要的是欄位名，
 * 後續才能檢查「呼叫它的那一行有沒有接住錯誤」。
 */
const auditField = (source: string): string | null => {
  const matched =
    /@Inject\(\s*\w*CHAT_AUDIT_PORT\s*\)\s*(?:private|public|protected)\s+readonly\s+(\w+)\s*:/.exec(
      source,
    );
  return matched?.[1] ?? null;
};

/**
 * 找出未接住錯誤的稽核呼叫。
 *
 * 判定方式刻意保守：呼叫所在的**那一行**必須出現 `.catch(`，
 * 或整份檔案中該呼叫被包在 `try {` 內。後者無法只靠正則精確判斷巢狀，
 * 因此採「同一行有 .catch」或「呼叫前方最近的 try 尚未閉合」的近似——
 * **誤報只是吵，漏報是靜默失效**，而這條規則出錯時不會有任何徵兆。
 *
 * @returns 未接錯誤的行號（1-based）
 */
export const uncaughtAuditCalls = (source: string): number[] => {
  const clean = stripComments(source);
  const field = auditField(clean);
  if (!field) return [];

  const callPattern = new RegExp(`this\\.${field}\\.\\w+\\(`);
  const lines = clean.split('\n');
  const offenders: number[] = [];

  lines.forEach((line, index) => {
    if (!callPattern.test(line)) return;

    // 同一行接住：`this.audit.record(...).catch(...)`
    if (line.includes('.catch(')) return;

    // 呼叫後面幾行接住：鏈式寫法會換行
    const following = lines.slice(index, index + 4).join('\n');
    if (following.includes('.catch(')) return;

    // 被 try 包住：往前找最近的 `try {`，且中間沒有 `}` 收掉它
    const before = lines.slice(0, index).join('\n');
    const lastTry = before.lastIndexOf('try {');
    if (lastTry >= 0) {
      const afterTry = before.slice(lastTry);
      const opened = (afterTry.match(/\{/g) ?? []).length;
      const closed = (afterTry.match(/\}/g) ?? []).length;
      if (opened > closed) return;
    }

    offenders.push(index + 1);
  });

  return offenders;
};

/**
 * 稽核與指標的相依方向。
 *
 * 兩條規則守的是同一件事：**可觀測性是橫切關注，不該讓業務程式碼承擔它的失敗與細節**。
 */
describe('架構守則：可觀測性不得滲入業務層', () => {
  const sources = collectSourceFiles(['src'], { exclude: ['.spec.ts'] });

  it('掃描範圍有效', () => {
    expect(sources.length).toBeGreaterThan(0);

    // 專案一定有稽核呼叫；掃到 0 個代表 port token 改名之類的事讓判定失效，
    // 而這條規則會就此靜默空轉——沒有這個檢查，沒有人會知道
    const withAuditCalls = sources.filter((file) =>
      /@Inject\(\s*\w*CHAT_AUDIT_PORT\s*\)/.test(
        stripComments(readSource(file)),
      ),
    );
    expect(withAuditCalls.length).toBeGreaterThan(0);
  });

  it('稽核 port 的呼叫必須接住錯誤', () => {
    const offenders = sources.flatMap((file) =>
      uncaughtAuditCalls(readSource(file)).map(
        (line) => `  ${toRelative(file)}:${line}`,
      ),
    );

    expect(
      offenders.length === 0
        ? ''
        : `以下稽核呼叫沒有接住錯誤：\n${offenders.join(
            '\n',
          )}\n稽核是 best-effort：稽核表滿了不該讓使用者送不出訊息。\n請用 .catch() 或 try/catch 接住並以 error 等級記錄。`,
    ).toBe('');
  });

  it('application 與 domain 不得相依監控套件', () => {
    const offenders = collectSourceFiles(['src/application', 'src/domain'], {
      exclude: ['.spec.ts'],
    })
      .filter((file) => METRICS_PACKAGES.test(stripComments(readSource(file))))
      .map((file) => `  ${toRelative(file)}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下業務層檔案直接相依監控套件：\n${offenders.join(
            '\n',
          )}\n請改用 MetricsPort——換掉監控實作時不該動到任何業務程式碼。`,
    ).toBe('');
  });

  /**
   * 守則自身的測試。
   *
   * 這兩條規則出錯都是**靜默的**：稽核那條只會少報，相依那條只會漏抓。
   * 而它們目前的「綠」有一部分來自「還沒有任何呼叫點」——
   * 合成輸入是唯一能證明判定真的會動的東西。
   */
  describe('判定邏輯（合成輸入）', () => {
    const withAudit = (body: string): string =>
      `export class S {\n  constructor(\n    @Inject(CHAT_AUDIT_PORT)\n    private readonly audit: ChatAuditPort,\n  ) {}\n\n  async execute() {\n${body}\n  }\n}`;

    it('A：裸呼叫未接錯誤 → 抓出', () => {
      const src = withAudit(
        `    await this.audit.record({ action: 'ROOM_LEFT' });`,
      );
      expect(uncaughtAuditCalls(src)).toHaveLength(1);
    });

    it('B：同一行 .catch() → 通過', () => {
      const src = withAudit(
        `    void this.audit.record({ action: 'ROOM_LEFT' }).catch(logIt);`,
      );
      expect(uncaughtAuditCalls(src)).toHaveLength(0);
    });

    it('C：鏈式換行的 .catch() → 通過', () => {
      const src = withAudit(
        `    void this.audit\n      .record({ action: 'ROOM_LEFT' })\n      .catch((error) => this.logger.error(error));`,
      );
      expect(uncaughtAuditCalls(src)).toHaveLength(0);
    });

    it('D：被 try/catch 包住 → 通過', () => {
      const src = withAudit(
        `    try {\n      await this.audit.record({ action: 'ROOM_LEFT' });\n    } catch (error) {\n      this.logger.error(error);\n    }`,
      );
      expect(uncaughtAuditCalls(src)).toHaveLength(0);
    });

    it('E：只有註解說明不影響業務 → 仍須抓出', () => {
      const src = withAudit(
        `    // 稽核失敗不影響業務，已 catch\n    await this.audit.record({ action: 'ROOM_LEFT' });`,
      );
      expect(uncaughtAuditCalls(src)).toHaveLength(1);
    });

    it('F：沒有注入稽核 port → 不檢查', () => {
      const src = `export class S {\n  async execute() {\n    await this.other.record({});\n  }\n}`;
      expect(uncaughtAuditCalls(src)).toHaveLength(0);
    });

    it('G：try 已閉合後的呼叫 → 仍須抓出', () => {
      const src = withAudit(
        `    try {\n      await doSomething();\n    } catch (error) {\n      this.logger.error(error);\n    }\n    await this.audit.record({ action: 'ROOM_LEFT' });`,
      );
      expect(uncaughtAuditCalls(src)).toHaveLength(1);
    });

    it('H：監控套件的比對認得兩種來源', () => {
      expect(
        METRICS_PACKAGES.test(`import { Counter } from 'prom-client';`),
      ).toBe(true);
      expect(
        METRICS_PACKAGES.test(
          `import { InjectMetric } from '@willsoto/nestjs-prometheus';`,
        ),
      ).toBe(true);
      expect(
        METRICS_PACKAGES.test(`import { X } from './prom-client-utils';`),
      ).toBe(false);
    });
  });
});
