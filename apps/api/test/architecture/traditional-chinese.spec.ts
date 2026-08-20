import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { API_ROOT } from './helpers';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');

/** 日文假名（平假名、片假名、半形片假名） */
const KANA = /[぀-ゟ゠-ヿｦ-ﾟ]/;

/**
 * 日文新字體與簡體字中，**與繁體不同且容易在打字時混入**的字。
 *
 * 不求窮盡——目標是攔下實際會發生的誤用（輸入法切換、從日文／簡體資料複製貼上），
 * 而不是做完整的字集驗證。發現新的漏網字就往這裡加。
 */
const NON_TRADITIONAL = new Set(
  '権図医実対発独読転択単続経済験覚学楽気国関数帰広応総労売価県剣沢覧続営児増両営歴験',
);

/**
 * 要掃描的位置。兩處刻意不列入：
 * - `pr/`：review 報告會逐字引用問題碼，那是引用不是違規。
 * - 本規則檔自身：它必須寫出所有被禁的字元才能比對，掃自己一定紅。
 */
const SCAN_DIRS = ['apps', 'packages', 'openspec', 'tasks', '.agents'];
const SELF = 'apps/api/test/architecture/traditional-chinese.spec.ts';
const SCAN_ROOT_FILES = ['README.md', 'CLAUDE.md'];
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.md', '.yaml', '.yml', '.mjs', '.sh'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

type Hit = { file: string; line: number; chars: string; text: string };

const collectFiles = (): string[] => {
  const found: string[] = [];

  const walk = (relative: string): void => {
    const absolute = join(REPO_ROOT, relative);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute)) {
      if (SKIP_DIRS.has(entry)) continue;
      const child = `${relative}/${entry}`;
      if (statSync(join(REPO_ROOT, child)).isDirectory()) {
        walk(child);
      } else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
        found.push(child);
      }
    }
  };

  SCAN_DIRS.forEach(walk);
  return [
    ...found,
    ...SCAN_ROOT_FILES.filter((f) => existsSync(join(REPO_ROOT, f))),
  ]
    .filter((f) => f.replace(/^\.\//, '') !== SELF)
    .sort();
};

/**
 * 文件語言規則：全專案不得出現日文，註解與 UI 文案一律繁體中文。
 *
 * 這類錯誤肉眼幾乎抓不到——「権」與「權」在 code review 中掃過去就是一個權限相關的字，
 * 本專案就是靠正規表示式才發現註解裡混了一個日文新字體。輸入法切換與複製貼上
 * 都會產生這種單字級的混入，是典型「只能靠機器抓」的規則。
 */
describe('架構守則：全專案只用繁體中文，不得混入日文', () => {
  const files = collectFiles();

  it('掃描範圍有效', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('不得出現日文假名或非繁體漢字', () => {
    const hits: Hit[] = [];

    for (const file of files) {
      const body = readFileSync(join(REPO_ROOT, file), 'utf8');
      body.split('\n').forEach((text, index) => {
        const kana = text.match(new RegExp(KANA, 'g')) ?? [];
        const nonTraditional = [...text].filter((c) => NON_TRADITIONAL.has(c));
        if (kana.length + nonTraditional.length > 0) {
          hits.push({
            file,
            line: index + 1,
            chars: [...new Set([...kana, ...nonTraditional])].join(''),
            text: text.trim().slice(0, 70),
          });
        }
      });
    }

    expect(
      hits.length === 0
        ? ''
        : `以下位置混入日文或非繁體漢字（共 ${hits.length} 處）：\n${hits
            .map((h) => `  ${h.file}:${h.line}  「${h.chars}」  ${h.text}`)
            .join(
              '\n',
            )}\n專案規則：註解、文件、UI 文案一律繁體中文（見 CLAUDE.md 的 Documentation Languages）`,
    ).toBe('');
  });
});
