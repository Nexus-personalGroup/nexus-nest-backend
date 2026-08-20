import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { API_ROOT } from './helpers';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');
const HOOKS_DIR = join(REPO_ROOT, '.agents', 'hooks');

/**
 * AI 工具的 hook 邏輯放在 `.agents/hooks/*.sh`（工具無關），設定檔只負責註冊。
 *
 * 這些 script 不在 `pnpm lint` 的範圍（那是 TypeScript 的 glob），若不另外檢查，
 * 就會重演本專案已經踩過兩次的「設定寫了但沒有執行路徑」——語法錯誤要等到
 * hook 實際觸發才會發現，而 hook 失敗往往是靜默的。
 *
 * `bash -n` 只做語法解析、不執行，安全且毫秒級。
 */
describe('架構守則：hook script 可執行且語法正確', () => {
  const scripts = existsSync(HOOKS_DIR)
    ? readdirSync(HOOKS_DIR).filter((f) => f.endsWith('.sh'))
    : [];

  it('掃描範圍有效', () => {
    // 目錄改名或 hook 全被移回設定檔時先紅，避免「0 個檔案」被誤讀成合規
    expect(scripts.length).toBeGreaterThan(0);
  });

  it('每支 hook script 都要通過 bash -n 語法檢查', () => {
    const broken: string[] = [];

    for (const script of scripts) {
      try {
        execFileSync('bash', ['-n', join(HOOKS_DIR, script)], {
          stdio: 'pipe',
        });
      } catch (error) {
        const detail =
          error instanceof Error && 'stderr' in error
            ? String((error as { stderr: Buffer }).stderr).trim()
            : String(error);
        broken.push(`  .agents/hooks/${script}\n    ${detail}`);
      }
    }

    expect(
      broken.length === 0
        ? ''
        : `以下 hook script 有 shell 語法錯誤（hook 觸發時會靜默失敗）：\n${broken.join('\n')}`,
    ).toBe('');
  });

  it('每支 hook script 都要有說明用途的檔頭註解', () => {
    const missing = scripts.filter((script) => {
      const head = readFileSync(join(HOOKS_DIR, script), 'utf8').slice(0, 400);
      // 首行是 shebang，接著應有說明區塊
      return !head.includes('#!') || !/\n#\s*=+/.test(head);
    });

    expect(
      missing.length === 0
        ? ''
        : `以下 hook script 缺少檔頭說明（用途 / 觸發時機 / exit code 語意）：\n${missing
            .map((s) => `  .agents/hooks/${s}`)
            .join('\n')}`,
    ).toBe('');
  });

  it('settings.json 註冊的 script 都必須存在', () => {
    const settings = readFileSync(
      join(REPO_ROOT, '.claude', 'settings.json'),
      'utf8',
    );
    const referenced = [
      ...settings.matchAll(/\.agents\/hooks\/([\w-]+\.sh)/g),
    ].map((m) => m[1]);

    expect(referenced.length).toBeGreaterThan(0);

    const missing = referenced.filter((name) => !scripts.includes(name));
    expect(
      missing.length === 0
        ? ''
        : `settings.json 註冊了不存在的 hook script：\n${missing
            .map((s) => `  .agents/hooks/${s}`)
            .join('\n')}`,
    ).toBe('');
  });
});
