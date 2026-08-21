import { collectSourceFiles, readSource, toRelative } from './helpers';
import { stripComments } from './ws-source';

/**
 * 清理程式碼的識別：`adapter/out/persistence` 之下、檔名含 Purge 或 Retention。
 *
 * 用檔名而非「有沒有 DELETE」判斷，是因為前者是**意圖**的宣告：
 * 一個叫 `XxxPurgeRepository` 的檔案就是拿來刪東西的，
 * 而它刪什麼正是這條規則要管的事。
 */
const isRetentionFile = (file: string): boolean =>
  /(Purge|Retention)/.test(file);

/** 清理**絕對不能**碰的資料表 */
const FORBIDDEN_TABLES = ['chat_messages', 'chatMessageRecord'] as const;

export const forbiddenTablesIn = (source: string): string[] => {
  const clean = stripComments(source);
  return FORBIDDEN_TABLES.filter((table) => clean.includes(table));
};

/**
 * 清理程式碼不得碰訊息表。
 *
 * **這條規則是一個設計決定的機器化**，而那個決定寫在文件裡會被忘記：
 *
 * 清理訊息會讓 `seq` 重新出現洞——而 `add-message-retraction` 堅持軟刪除的唯一理由
 * 就是「刪掉那一列會讓 seq 出現洞，補齊的客戶端無法區分『被撤回』與『我漏收了』」。
 * 清理舊訊息會原封不動地把那個問題帶回來，只是換成「被清掉」與「我漏收了」，
 * 而客戶端唯一合理的反應是反覆嘗試補同一段區間。
 *
 * 要清訊息，必須先讓斷線補齊的回應能表達「最舊的可用 seq」。那會動到 WS 契約與前台，
 * 是另一個 change 的範圍。在那之前，**任何清理訊息的程式碼都是回歸**。
 *
 * 訊息保留同時也是**產品承諾**而非技術清理：使用者預期對話留著。
 */
describe('架構守則：清理程式碼不得碰訊息表', () => {
  const retentionFiles = collectSourceFiles(
    ['src/adapter/out/persistence', 'src/application/service'],
    { exclude: ['.spec.ts'] },
  ).filter((file) => isRetentionFile(file));

  it('掃描範圍有效', () => {
    // 專案一定有清理程式碼；掃到 0 個代表命名慣例改了而規則沒跟上，
    // 它會就此靜默空轉——沒有這個檢查，沒有人會知道
    expect(retentionFiles.length).toBeGreaterThan(0);
  });

  it('清理程式碼不得出現訊息表', () => {
    const offenders = retentionFiles
      .map((file) => ({
        file: toRelative(file),
        tables: forbiddenTablesIn(readSource(file)),
      }))
      .filter((entry) => entry.tables.length > 0)
      .map((entry) => `  ${entry.file}  出現：${entry.tables.join('、')}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下清理程式碼碰到了訊息表：\n${offenders.join(
            '\n',
          )}\n清理訊息會讓 seq 重新出現洞——補齊的客戶端無法區分「被清掉」與「我漏收了」，\n而它唯一合理的反應是反覆嘗試補同一段區間。\n要清訊息必須先讓 roomSynced 能表達「最舊的可用 seq」，那是另一個 change。`,
    ).toBe('');
  });

  /**
   * 守則自身的測試。
   *
   * 這條規則平時永遠是綠的（沒有人在清訊息），因此它的正確性**完全**由合成輸入保證——
   * 真實樣本要等有人違規才會出現，而那時候已經太晚了。
   */
  describe('判定邏輯（合成輸入）', () => {
    it('A：清理檔案出現 chat_messages → 抓出', () => {
      expect(
        forbiddenTablesIn(`DELETE FROM chat_messages WHERE ctid IN (...)`),
      ).toEqual(['chat_messages']);
    });

    it('B：出現 Prisma 的 model 名也算', () => {
      expect(
        forbiddenTablesIn(`await tx.chatMessageRecord.deleteMany({});`),
      ).toEqual(['chatMessageRecord']);
    });

    it('C：清理稽核與檢舉 → 通過', () => {
      expect(
        forbiddenTablesIn(
          `DELETE FROM chat_audit_logs WHERE created_at < $1; DELETE FROM chat_reports WHERE reviewed_at < $1;`,
        ),
      ).toHaveLength(0);
    });

    it('D：只有註解提到 → 不判定為違規', () => {
      expect(
        forbiddenTablesIn(
          `// 刻意不清理 chat_messages：會讓 seq 出現洞\nconst tables = ['chat_audit_logs'];`,
        ),
      ).toHaveLength(0);
    });

    it('E：檔名判定認得兩種命名', () => {
      expect(isRetentionFile('src/x/PrismaLogPurgeRepository.ts')).toBe(true);
      expect(isRetentionFile('src/x/ChatRetentionService.ts')).toBe(true);
      expect(isRetentionFile('src/x/PrismaChatMessageRepository.ts')).toBe(
        false,
      );
    });
  });
});
