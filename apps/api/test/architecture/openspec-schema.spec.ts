import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';
import { API_ROOT } from './helpers';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');
const OPENSPEC_ROOT = join(REPO_ROOT, 'openspec');
const SCHEMA_NAME = 'spec-driven-custom';
const SCHEMA_DIR = join(OPENSPEC_ROOT, 'schemas', SCHEMA_NAME);
const CHANGES_DIR = join(OPENSPEC_ROOT, 'changes');

/**
 * 專案的 spec / tasks 格式規範放在 fork 出來的 openspec schema，
 * 由 `openspec instructions` 在產出 artifact 時餵給 AI。
 *
 * 這裡守的是**執行路徑**而非格式本身：`openspec config` 只支援 global scope，
 * 專案預設 schema 進不了版控，`openspec new change` 沒帶 `--schema` 就會靜默落回
 * 內建 schema，規範等於不存在——這正是本專案已經踩過多次的「設定寫了但沒有執行路徑」。
 */
describe('架構守則：openspec 自訂 schema 的執行路徑', () => {
  it('自訂 schema 與三份模板都存在', () => {
    const required = [
      'schema.yaml',
      'templates/proposal.md',
      'templates/spec.md',
      'templates/tasks.md',
    ];

    const missing = required.filter(
      (relative) => !existsSync(join(SCHEMA_DIR, relative)),
    );

    expect(
      missing.length === 0
        ? ''
        : `自訂 schema 缺少以下檔案（openspec instructions 會落回內建版）：\n${missing
            .map((f) => `  openspec/schemas/${SCHEMA_NAME}/${f}`)
            .join('\n')}`,
    ).toBe('');
  });

  it('schema.yaml 可解析且四個 artifact 齊全', () => {
    const parsed = load(readFileSync(join(SCHEMA_DIR, 'schema.yaml'), 'utf8'));

    expect(typeof parsed).toBe('object');
    const schema: unknown = parsed;
    if (typeof schema !== 'object' || schema === null) {
      throw new Error('schema.yaml 不是物件');
    }

    const artifacts = 'artifacts' in schema ? schema.artifacts : undefined;
    expect(Array.isArray(artifacts)).toBe(true);

    const ids = (Array.isArray(artifacts) ? artifacts : [])
      .map((a: unknown) =>
        typeof a === 'object' && a !== null && 'id' in a ? String(a.id) : '',
      )
      .sort();

    expect(ids).toEqual(['design', 'proposal', 'specs', 'tasks']);
  });

  it('所有教 AI 建立 change 的指令都必須帶 --schema', () => {
    // 不只盯單一檔案：propose 流程在 .claude/skills/ 與 .claude/commands/opsx/ 各有一份，
    // 只檢查其中一份的結果，就是改了 skill、command 卻靜默留在內建 schema。
    const missingFlag: string[] = [];
    let creations = 0;

    const walk = (relativeDir: string): void => {
      const absolute = join(REPO_ROOT, relativeDir);
      if (!existsSync(absolute)) return;
      for (const entry of readdirSync(absolute)) {
        const relative = `${relativeDir}/${entry}`;
        if (statSync(join(REPO_ROOT, relative)).isDirectory()) {
          walk(relative);
          continue;
        }
        if (!entry.endsWith('.md')) continue;

        const body = readFileSync(join(REPO_ROOT, relative), 'utf8');
        // 只認真正的呼叫（後面接得出名稱），不認散文裡純提及的 `openspec new change`
        for (const match of body.matchAll(
          /openspec new change\s+["'<][^\n`]*/g,
        )) {
          creations += 1;
          if (!match[0].includes(`--schema ${SCHEMA_NAME}`)) {
            missingFlag.push(`  ${relative}\n    ${match[0].trim()}`);
          }
        }
      }
    };

    walk('.claude');

    // 指令全數消失（檔案改名或流程改寫）時先紅，否則這條規則會空轉
    expect(creations).toBeGreaterThan(0);

    expect(
      missingFlag.length === 0
        ? ''
        : `以下建立 change 的指令未指定自訂 schema，用它建出來的 change 會落回內建 schema：\n${missingFlag.join(
            '\n',
          )}\n應為 \`openspec new change "<name>" --schema ${SCHEMA_NAME}\``,
    ).toBe('');
  });

  it('opsx 指令必須是轉呼叫 skill 的薄殼，不得再抄一份流程', () => {
    const commandsDir = join(REPO_ROOT, '.claude', 'commands', 'opsx');
    const commands = existsSync(commandsDir)
      ? readdirSync(commandsDir).filter((f) => f.endsWith('.md'))
      : [];

    expect(commands.length).toBeGreaterThan(0);

    // 薄殼合理上限：frontmatter + 轉呼叫說明 + 為何要薄的理由，40 行綽綽有餘。
    // 超過就代表流程又被抄回來了——四支曾經漂到與 skill 差 20～143 行，
    // 導致 skill 補上 --schema 後 /opsx:propose 仍在用內建 schema。
    const MAX_LINES = 40;
    const fat: string[] = [];

    for (const file of commands) {
      const body = readFileSync(join(commandsDir, file), 'utf8');
      const lines = body.split('\n').length;
      const delegates = /Skill tool|skills\/[\w-]+\/SKILL\.md/.test(body);

      if (lines > MAX_LINES || !delegates) {
        fat.push(
          `  .claude/commands/opsx/${file}（${lines} 行，${delegates ? '有' : '未'}轉呼叫 skill）`,
        );
      }
    }

    expect(
      fat.length === 0
        ? ''
        : `以下 opsx 指令不再是薄殼：\n${fat.join(
            '\n',
          )}\n流程只能有一份真相，寫在 .claude/skills/<name>/SKILL.md；指令檔只負責轉呼叫（上限 ${MAX_LINES} 行）`,
    ).toBe('');
  });

  it('進行中的 change 都必須使用自訂 schema', () => {
    const active = existsSync(CHANGES_DIR)
      ? readdirSync(CHANGES_DIR, { withFileTypes: true })
          .filter((e) => e.isDirectory() && e.name !== 'archive')
          .map((e) => e.name)
      : [];

    // 沒有進行中的 change 是正常狀態，不做「掃描數 > 0」檢查——
    // 這條規則的空轉風險由上一條（skill 必帶 --schema）擋住
    const wrong = active.filter((name) => {
      const config = join(CHANGES_DIR, name, '.openspec.yaml');
      if (!existsSync(config)) return true;
      return !/^\s*schema:\s*spec-driven-custom\s*$/m.test(
        readFileSync(config, 'utf8'),
      );
    });

    expect(
      wrong.length === 0
        ? ''
        : `以下 change 未使用自訂 schema（格式規範不會生效）：\n${wrong
            .map((n) => `  openspec/changes/${n}/.openspec.yaml`)
            .join(
              '\n',
            )}\n以 \`openspec new change "<name>" --schema ${SCHEMA_NAME}\` 重建，或直接改 .openspec.yaml 的 schema 欄位`,
    ).toBe('');
  });
});
