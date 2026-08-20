import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, posix } from 'path';
import { API_ROOT } from './helpers';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');
const INDEX = 'openspec/project.md';
const DETAIL_DIR = 'openspec/project';

const read = (relative: string): string =>
  readFileSync(join(REPO_ROOT, relative), 'utf8');

/** 收集要檢查引用的 markdown（archive 是歷史紀錄，不跟著改） */
const docsToScan = (): string[] => {
  const found: string[] = ['README.md', 'CLAUDE.md', INDEX];

  const walk = (relativeDir: string): void => {
    const absolute = join(REPO_ROOT, relativeDir);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute)) {
      const relative = posix.join(relativeDir, entry);
      if (statSync(join(REPO_ROOT, relative)).isDirectory()) {
        walk(relative);
      } else if (entry.endsWith('.md')) {
        found.push(relative);
      }
    }
  };

  walk(DETAIL_DIR);
  walk('openspec/specs');
  walk('tasks');

  return found.filter((file) => existsSync(join(REPO_ROOT, file)));
};

/**
 * `openspec/project.md` 拆成索引 + `openspec/project/` 子檔後的完整性。
 *
 * 拆文件的典型失效不是拆錯，而是**連結爛掉沒人發現**：搬走一個章節、改名一支子檔，
 * 或新增子檔卻忘了掛進索引，讀的人只會看到 404 或永遠找不到那份內容。
 * 這裡守三件事：索引連到的檔案都在、子檔都被索引連到、全 repo 對子檔的引用都有效。
 */
describe('架構守則：project.md 索引與子檔的連結完整性', () => {
  const detailFiles = existsSync(join(REPO_ROOT, DETAIL_DIR))
    ? readdirSync(join(REPO_ROOT, DETAIL_DIR))
        .filter((f) => f.endsWith('.md'))
        .sort()
    : [];

  it('掃描範圍有效', () => {
    expect(existsSync(join(REPO_ROOT, INDEX))).toBe(true);
    expect(detailFiles.length).toBeGreaterThan(0);
  });

  it('索引連到的子檔都必須存在', () => {
    const linked = [
      ...read(INDEX).matchAll(/\]\((project\/[\w-]+\.md)\)/g),
    ].map((m) => m[1]);

    expect(linked.length).toBeGreaterThan(0);

    const missing = linked.filter(
      (link) => !existsSync(join(REPO_ROOT, 'openspec', link)),
    );

    expect(
      missing.length === 0
        ? ''
        : `openspec/project.md 連到不存在的子檔：\n${missing
            .map((l) => `  openspec/${l}`)
            .join('\n')}`,
    ).toBe('');
  });

  it('每支子檔都必須被索引連到（不得有孤兒檔）', () => {
    const index = read(INDEX);
    const orphans = detailFiles.filter(
      (file) => !index.includes(`project/${file}`),
    );

    expect(
      orphans.length === 0
        ? ''
        : `以下子檔沒有掛進 openspec/project.md 的導覽表，讀的人找不到：\n${orphans
            .map((f) => `  openspec/${DETAIL_DIR.split('/')[1]}/${f}`)
            .join('\n')}`,
    ).toBe('');
  });

  it('全 repo 對 openspec/project/ 子檔的引用都必須有效', () => {
    const broken: string[] = [];
    let references = 0;

    for (const doc of docsToScan()) {
      const body = read(doc);
      for (const match of body.matchAll(/openspec\/project\/([\w-]+\.md)/g)) {
        references += 1;
        if (!detailFiles.includes(match[1])) {
          broken.push(`  ${doc} → openspec/project/${match[1]}`);
        }
      }
    }

    // 沒有任何引用代表正規式或掃描清單失效，這條規則會空轉
    expect(references).toBeGreaterThan(0);

    expect(
      broken.length === 0
        ? ''
        : `以下引用指向不存在的子檔（子檔改名時漏改）：\n${broken.join('\n')}`,
    ).toBe('');
  });
});
