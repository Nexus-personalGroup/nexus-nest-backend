import { CHAT_MESSAGE_ACCESS_EXEMPTIONS } from './allowlist';
import { collectSourceFiles, readSource, toRelative } from './helpers';
import { stripComments } from './ws-source';

/** 訊息表的 Prisma 存取子 */
const MESSAGE_TABLE = /\bprisma\.chatMessageRecord\b|\btx\.chatMessageRecord\b/;

/** 唯一合法的入口 */
const REPOSITORY =
  'src/adapter/out/persistence/chat-message/PrismaChatMessageRepository.ts';

/**
 * 判定一份原始碼是否存取訊息表。
 *
 * 先去註解：說明「訊息表只能由 repository 存取」的文字，最常出現在
 * 遵守這條規則的檔案裡——用字串比對會讓偽陽性集中在本來就正確的地方。
 */
export const touchesMessageTable = (source: string): boolean =>
  MESSAGE_TABLE.test(stripComments(source));

/**
 * 與調查相關的豁免，理由必須同時說明三件事。
 *
 * 「看得到被撤回內容」的需求遲早會直接落到 `chat_messages` 上（例如後台查看某人的
 * 完整對話），而**那時候的人會有充分的理由趕著加豁免**。標準要在還不急的時候立好。
 *
 * 三個關鍵詞各自對應一個代價：僅限後台（範圍）、需 RBAC（授權）、查看留稽核（可追溯）。
 * 少任何一項，這條豁免就只是「有人需要繞過」而非「繞過的代價已經付清」。
 */
const REQUIRED_REASON_TERMS = [
  { term: /後台/, label: '僅限後台' },
  { term: /RBAC|權限/, label: '需 RBAC 授權' },
  { term: /稽核/, label: '查看留稽核' },
] as const;

export const missingReasonTerms = (reason: string): string[] =>
  REQUIRED_REASON_TERMS.filter(({ term }) => !term.test(reason)).map(
    ({ label }) => label,
  );

/**
 * 訊息的持久層存取必須只有一個入口。
 *
 * 理由不是分層潔癖，是**內容遮蔽只寫在一處**：被撤回的訊息內容保留在資料庫供
 * M3 的檢舉調查，但一律不得外流。遮蔽發生在 repository 把資料列投影成對外物件的
 * 那一個函式裡，因此多一個查詢入口就多一條繞過遮蔽的路徑。
 *
 * 而它不會有徵兆：讀取路徑有三條（歷史查詢、斷線補齊、即時廣播），
 * 測試若只驗歷史查詢，補齊那條照樣洩漏。
 *
 * 後台的檢舉調查之後會需要一條看得到內容的路徑。它要走豁免並註明
 * 「僅限後台、需 RBAC 授權、且必須留稽核紀錄」，不是放寬這條規則。
 */
describe('架構守則：訊息表只能由其 repository 存取', () => {
  // 只掃 src：測試與 seed 為了準備資料本來就要直接寫入訊息表，
  // 它們不是對外的讀取路徑，也不會經過遮蔽——把它們納入只會逼出一份
  // 沒有意義的豁免清單，而清單一長就沒有人在看
  const sources = collectSourceFiles(['src'], { exclude: ['.spec.ts'] });

  const isExempt = (file: string): boolean =>
    CHAT_MESSAGE_ACCESS_EXEMPTIONS.some(
      (exemption) => exemption.file === toRelative(file),
    );

  it('掃描範圍有效', () => {
    expect(sources.length).toBeGreaterThan(0);
    // repository 自己一定會存取；掃不到它代表比對失效，規則會空轉
    expect(
      sources.filter((file) => touchesMessageTable(readSource(file))).length,
    ).toBeGreaterThan(0);
  });

  it('src 內只有訊息 repository 能存取訊息表', () => {
    const offenders = sources
      .filter((file) => toRelative(file) !== REPOSITORY)
      .filter((file) => touchesMessageTable(readSource(file)))
      .filter((file) => !isExempt(file))
      .map((file) => `  ${toRelative(file)}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下位置直接存取訊息表：\n${offenders.join(
            '\n',
          )}\n被撤回的訊息內容保留在資料庫但不得外流，遮蔽只寫在 repository 的投影函式一處。\n多一個入口就多一條繞過遮蔽的路徑，且不會有任何徵兆。`,
    ).toBe('');
  });

  it('豁免清單不得有過期項目', () => {
    const expired = CHAT_MESSAGE_ACCESS_EXEMPTIONS.filter(
      (exemption) =>
        !sources.some(
          (file) =>
            toRelative(file) === exemption.file &&
            touchesMessageTable(readSource(file)),
        ),
    ).map((exemption) => `  ${exemption.file}`);

    expect(
      expired.length === 0
        ? ''
        : `以下豁免已過期（該檔已不再存取訊息表）：\n${expired.join(
            '\n',
          )}\n請從 test/architecture/allowlist.ts 移除，避免白名單無限膨脹`,
    ).toBe('');
  });

  it('每筆豁免都必須註明理由', () => {
    const noReason = CHAT_MESSAGE_ACCESS_EXEMPTIONS.filter(
      (exemption) => exemption.reason.trim().length === 0,
    ).map((exemption) => `  ${exemption.file}`);

    expect(
      noReason.length === 0
        ? ''
        : `以下豁免沒有理由：\n${noReason.join(
            '\n',
          )}\n豁免一旦失去理由就會逐漸長大`,
    ).toBe('');
  });

  it('與調查相關的豁免必須說明三個條件', () => {
    const incomplete = CHAT_MESSAGE_ACCESS_EXEMPTIONS.map((exemption) => ({
      file: exemption.file,
      missing: missingReasonTerms(exemption.reason),
    }))
      .filter((entry) => entry.missing.length > 0)
      .map((entry) => `  ${entry.file}  缺少：${entry.missing.join('、')}`);

    expect(
      incomplete.length === 0
        ? ''
        : `以下豁免的理由沒有說清代價：\n${incomplete.join(
            '\n',
          )}\n繞過內容遮蔽的路徑必須同時「僅限後台、需 RBAC 授權、查看留稽核」。\n代價沒付清的豁免等同於放寬規則。`,
    ).toBe('');
  });

  /**
   * 守則自身的測試。
   *
   * 這支規則出錯是**靜默的**——它只會少報，不會有任何徵兆。
   */
  describe('判定邏輯（合成輸入）', () => {
    it('豁免理由只寫「後台要用」→ 缺兩項', () => {
      expect(missingReasonTerms('後台調查要用')).toEqual([
        '需 RBAC 授權',
        '查看留稽核',
      ]);
    });

    it('豁免理由三者齊全 → 通過', () => {
      expect(
        missingReasonTerms(
          '僅限後台的調查路徑，需 RBAC 授權（@Permissions），且查看行為本身會寫稽核',
        ),
      ).toHaveLength(0);
    });

    it('空理由 → 三項都缺', () => {
      expect(missingReasonTerms('')).toHaveLength(3);
    });

    it('A：service 直接查訊息表 → 判定為存取', () => {
      const src = `const rows = await this.prisma.chatMessageRecord.findMany({});`;
      expect(touchesMessageTable(src)).toBe(true);
    });

    it('B：交易內的存取也算（tx.chatMessageRecord）', () => {
      const src = `await tx.chatMessageRecord.create({ data });`;
      expect(touchesMessageTable(src)).toBe(true);
    });

    it('C：只有註解提到 → 不判定為存取', () => {
      const src = `// 訊息表只能由 PrismaChatMessageRepository 的 prisma.chatMessageRecord 存取\nexport class X {}`;
      expect(touchesMessageTable(src)).toBe(false);
    });

    it('D：存取其他表 → 不判定', () => {
      const src = `await this.prisma.chatRoomRecord.findMany({});`;
      expect(touchesMessageTable(src)).toBe(false);
    });

    // 名稱前綴相同的其他 model 不該被誤判
    it('E：chatMessageRecordArchive 這類前綴相同的表 → 不判定', () => {
      const src = `await this.prisma.chatMessageRecordArchive.findMany({});`;
      expect(touchesMessageTable(src)).toBe(false);
    });
  });
});
