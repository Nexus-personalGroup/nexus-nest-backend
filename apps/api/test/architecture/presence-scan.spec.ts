import { PRESENCE_SCAN_EXEMPTIONS } from './allowlist';
import { collectSourceFiles, readSource, toRelative } from './helpers';
import { stripComments } from './ws-source';

/** 掃描所有 presence key 的 pattern 建構函式 */
const SCAN_PATTERN = 'buildPresenceScanPattern';

/**
 * 找出用到掃描 pattern 的方法名。
 *
 * **判定以方法為單位而非檔案。** presence 的 adapter 同時擁有清理與查詢兩種方法——
 * 以檔案為單位的規則會把整個 adapter 放行，於是「查詢方法拿去掃描」這種錯
 * 一個字都不會說。那正是 `countOnlineMembers` 曾經犯過的錯：
 * 它與 `sweepStale` 在同一個檔案裡。
 */
export const methodsUsingScan = (source: string): string[] => {
  const clean = stripComments(source);
  const methods: string[] = [];

  // 以「方法宣告」切段：下一個宣告之前的內容都屬於當前方法
  const declarations = [
    ...clean.matchAll(/^\s{2}(?:private\s+|public\s+)?(?:async\s+)?(\w+)\(/gm),
  ];

  declarations.forEach((match, index) => {
    const start = match.index ?? 0;
    const end = declarations[index + 1]?.index ?? clean.length;
    if (clean.slice(start, end).includes(SCAN_PATTERN)) {
      methods.push(match[1]);
    }
  });

  return methods;
};

/**
 * 掃描 presence keyspace 只能在週期性清理中使用。
 *
 * `cache-keys.ts` 早就寫著「不可用於請求路徑」——而**註解不會失敗**，
 * 所以 `add-admin-dashboard` 照樣把它用在了 `countOnlineMembers()` 上，
 * 還掛在每 5 秒一次的 SSE 推送上。單次成本是一次全 keyspace SCAN 加 N 次 HGETALL，
 * 乘上推送頻率、乘上實例數——一個「使用者越多越糟」的成本。
 *
 * 這條規則要抓的不是那一次，是下一次。
 */
describe('架構守則：presence 掃描只能用於週期性清理', () => {
  const sources = collectSourceFiles(['src'], { exclude: ['.spec.ts'] }).filter(
    (file) => stripComments(readSource(file)).includes(SCAN_PATTERN),
  );

  const allowed = new Set(PRESENCE_SCAN_EXEMPTIONS.map((item) => item.method));

  it('掃描範圍有效', () => {
    // 掃到 0 個使用點代表 pattern 改名或解析失效，規則會就此空轉
    expect(sources.length).toBeGreaterThan(0);
    expect(
      sources.flatMap((file) => methodsUsingScan(readSource(file))).length,
    ).toBeGreaterThan(0);
  });

  it('只有列入豁免的方法可以使用掃描 pattern', () => {
    const offenders = sources.flatMap((file) =>
      methodsUsingScan(readSource(file))
        .filter((method) => !allowed.has(method))
        .map((method) => `  ${toRelative(file)}  ${method}()`),
    );

    expect(
      offenders.length === 0
        ? ''
        : `以下方法使用了 presence 的掃描 pattern：\n${offenders.join(
            '\n',
          )}\n掃整個 keyspace 的成本隨在線人數線性成長，掛在請求路徑上會在服務最忙時放大。\n只有週期性清理可以用它；確實需要的請列入 allowlist.ts 的 PRESENCE_SCAN_EXEMPTIONS 並註明理由。`,
    ).toBe('');
  });

  it('每筆豁免都必須註明理由', () => {
    const noReason = PRESENCE_SCAN_EXEMPTIONS.filter(
      (item) => item.reason.trim().length === 0,
    ).map((item) => `  ${item.method}`);

    expect(
      noReason.length === 0 ? '' : `以下豁免沒有理由：\n${noReason.join('\n')}`,
    ).toBe('');
  });

  /**
   * 守則自身的測試。
   *
   * 這條規則出錯是靜默的：它只會少報，而少報看起來與「沒有違規」一模一樣。
   */
  describe('判定邏輯（合成輸入）', () => {
    const cls = (body: string): string => `class A {\n${body}\n}`;

    it('A：清理方法使用 → 抓得到方法名', () => {
      const src = cls(
        `  async sweepStale() {\n    const keys = await this.redis.scanKeys(buildPresenceScanPattern(p));\n  }`,
      );
      expect(methodsUsingScan(src)).toEqual(['sweepStale']);
    });

    /**
     * **這支是整條規則的重點。**
     *
     * 兩個方法在同一個檔案裡，而只有其中一個該被放行——
     * 以檔案為單位的規則在這裡會完全沉默。
     */
    it('⭐ B：同一檔案裡的查詢方法也使用 → 兩個都抓出來', () => {
      const src = cls(
        `  async sweepStale() {\n    await this.redis.scanKeys(buildPresenceScanPattern(p));\n  }\n\n  async countOnlineMembers() {\n    const keys = await this.redis.scanKeys(buildPresenceScanPattern(p));\n  }`,
      );
      expect(methodsUsingScan(src)).toEqual([
        'sweepStale',
        'countOnlineMembers',
      ]);
    });

    it('C：只有註解提到 → 不算違規', () => {
      const src = cls(
        `  async countOnlineMembers() {\n    // 不要用 buildPresenceScanPattern，成本隨人數成長\n    return this.redis.setCard(k);\n  }`,
      );
      expect(methodsUsingScan(src)).toEqual([]);
    });

    it('D：沒有任何方法使用 → 空陣列', () => {
      const src = cls(`  async isOnline() {\n    return true;\n  }`);
      expect(methodsUsingScan(src)).toEqual([]);
    });
  });
});
