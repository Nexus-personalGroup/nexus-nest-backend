import { collectSourceFiles, readSource } from './helpers';

/**
 * 守則檔數量的下限。
 *
 * **只擋變少，不要求相等。** 要求精確相等的話，每加一條守則就要回來改一次
 * 這個數字——那種規則會被當成雜訊繞過，最後跟寫死在文件裡的數字一樣沒用。
 *
 * 新增守則時**不必動它**。累積一段時間後再往上調，那是一個刻意的動作，
 * 不是每次都要付的維護成本。
 */
const MINIMUM_GUARDRAIL_FILES = 29;

/** 文件裡「N 個規則檔」這類寫死的規模描述 */
const HARDCODED_COUNT =
  /\d+\s*(?:rule files|個規則檔|條守則檔|個守則檔|支\s*\/\s*\d+\s*項斷言)/i;

/**
 * 會被檢查的文件：專案說明、CLAUDE.md 與 README。
 *
 * README 一開始不在清單裡，於是它繼續寫著「19 支規則檔 / 79 項斷言」
 * 而實際是 29 / 207——**同一種漂移在沒被掃到的地方原封不動地留著**。
 * 規則的涵蓋範圍要跟著「哪裡會寫這種數字」走，不是跟著目錄結構走。
 */
const DOC_FILES = [
  ...collectSourceFiles(['../../openspec/project'], { extensions: ['.md'] }),
  '../../CLAUDE.md',
  '../../README.md',
];

/**
 * 守則清單的自我維護。
 *
 * **這條守的是一個沒有人會發現的失效。** `CLAUDE.md` 曾經寫著
 * 「11 rule files / 32 assertions」，而實際是 28 / 199。那個數字的用途
 * 是讓未來的自己判斷「守則有沒有被誤刪」——一旦它落後，
 * 真正的減少就會躲在誤差裡看起來正常。
 *
 * **錯誤的基準值比沒有基準值更糟**，而它壞掉的方式是安靜地失去用途：
 * 沒有任何檢查會告訴你那行字已經不對了。
 *
 * 因此數字只留在這裡，由測試自己斷言；文件改成不帶數字的描述。
 */
describe('架構守則：守則清單必須自我維護', () => {
  const guardrails = collectSourceFiles(['test/architecture'], {
    extensions: ['.spec.ts'],
  });

  it('掃描範圍有效', () => {
    // 掃到 0 個代表目錄搬了而規則沒跟上，它會就此靜默空轉
    expect(guardrails.length).toBeGreaterThan(0);
    expect(DOC_FILES.length).toBeGreaterThan(1);
  });

  it('守則檔數量不得低於基準', () => {
    expect(
      guardrails.length >= MINIMUM_GUARDRAIL_FILES
        ? ''
        : `守則檔從 ${MINIMUM_GUARDRAIL_FILES} 個減少到 ${guardrails.length} 個。\n刪除守則可以，但要是刻意的：確認後把 MINIMUM_GUARDRAIL_FILES 一起調降，並在該 change 的 tasks.md 寫下理由。\n若不是刻意的，那就是誤刪——這正是本規則存在的原因。`,
    ).toBe('');
  });

  /**
   * 文件不得寫死守則數量。
   *
   * 這是同一條規則的另一半：數字只在測試裡，文件裡不該有第二份，
   * 因為第二份一定會先過期。
   */
  it('文件不得以寫死的數字描述守則規模', () => {
    const offenders = DOC_FILES.filter((file) =>
      HARDCODED_COUNT.test(readSource(file)),
    ).map((file) => `  ${file}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下文件寫死了守則數量：\n${offenders.join('\n')}\n數字會過期，而過期的基準值比沒有基準值更糟——它讓真正的減少看起來正常。\n請改成不帶數字的描述，數量交給 test:arch 自己斷言。`,
    ).toBe('');
  });

  /**
   * 守則清單的文件必須完整。
   *
   * `testing.md` 有一張「每一支守則守住什麼」的表。它曾經列 19 支而實際有 29 支
   * ——**漏掉的 10 支裡有好幾支是當時剛加的**，加的人沒想到要回頭補表。
   *
   * 靠自律維護的清單一定會漂移。改成機器檢查之後，
   * **新增一支守則卻沒補文件就會紅**，而那正是唯一會被記得的時機。
   */
  it('testing.md 必須涵蓋每一支守則', () => {
    const documented = new Set(
      [
        ...readSource('../../openspec/project/testing.md').matchAll(
          /`([a-z0-9-]+\.spec\.ts)`/g,
        ),
      ].map((m) => m[1]),
    );
    const missing = guardrails
      .map((file) => file.split('/').pop() ?? file)
      .filter((name) => !documented.has(name))
      .map((name) => `  ${name}`);

    expect(
      missing.length === 0
        ? ''
        : `以下守則沒有記錄在 openspec/project/testing.md 的規則表：\n${missing.join('\n')}\n新增守則時要一併補一列說明它守住什麼——那是唯一會被記得的時機。`,
    ).toBe('');
  });

  // 規則自身的測試：樣式抓不到東西的話，上一條會永遠通過
  describe('判定邏輯（合成輸入）', () => {
    it.each([
      ['11 rule files / 32 assertions', true],
      ['28 個規則檔', true],
      ['11 條守則檔', true],
      ['19 支 / 79 項斷言', true],
      ['架構守則（數量見 test:arch 輸出）', false],
      ['共 11 支 e2e 測試', false],
    ])('%s → %s', (text, expected) => {
      expect(HARDCODED_COUNT.test(text)).toBe(expected);
    });
  });
});
