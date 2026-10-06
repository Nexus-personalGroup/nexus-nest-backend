import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { API_ROOT } from './helpers';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');

/**
 * CI 必須出現的指令。
 *
 * **清單由本檔宣告，不從設定檔反推。** 反推的話「設定檔漏掉某一項」看起來
 * 完全正常——而那正是最該被抓到的情況（例如寫成 `pnpm test` 而不是
 * `pnpm test:cov`，於是四個覆蓋率門檻靜默不執行）。
 *
 * 每一條都對應一種靜默的失效：
 */
const REQUIRED_COMMANDS: ReadonlyArray<{ command: string; why: string }> = [
  { command: 'pnpm typecheck', why: '型別錯誤' },
  { command: 'pnpm lint', why: 'lint 與家規' },
  {
    command: 'pnpm test:cov',
    why: '**必須是 test:cov 不是 test**——四個覆蓋率門檻只在前者執行，用 test 會讓門檻靜默失效',
  },
  {
    command: 'test:e2e',
    why: 'e2e 對真實資料庫；只有它抓得到 DI 接線與 adapter 層的問題',
  },
  {
    command: 'pnpm build',
    why: 'nest build / vite build 抓得到 path alias 解析、decorator metadata 與 emit 階段的錯誤，tsc --noEmit 抓不到',
  },
];

/** `image: postgres:17` / `redis:7` 這種宣告，取出「名稱 → 版本集合」 */
const imageVersions = (body: string): Map<string, Set<string>> => {
  const found = new Map<string, Set<string>>();
  for (const match of body.matchAll(
    /image:\s*["']?(postgres|redis):([\w.]+)/g,
  )) {
    const [, name, version] = match;
    if (!found.has(name)) found.set(name, new Set());
    found.get(name)?.add(version);
  }
  return found;
};

const ciBody = (): string => {
  const workflows = join(REPO_ROOT, '.github', 'workflows');
  if (!existsSync(workflows)) return '';
  return readdirSync(workflows)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => readFileSync(join(workflows, f), 'utf8'))
    .join('\n');
};

const composeBody = (): string => {
  const compose = join(REPO_ROOT, 'compose.yml');
  return existsSync(compose) ? readFileSync(compose, 'utf8') : '';
};

/**
 * CI 與本機容器環境必須跑同一組檢查、同一條版本線。
 *
 * **CI 設定的錯誤方式全是靜默的**：漏了 `test:cov` 只是覆蓋率門檻不執行、
 * 漏了 `build` 只是 path alias 的錯誤延到合併後才爆、映像版本不同則產生
 * 「本機過、CI 掛」而**差異在版本不在程式碼**——那是最難查的一種。
 * 沒有一項會在設定寫錯的當下出聲。
 *
 * 比對的是「跑了哪些指令」與「映像版本線」，**不解析 YAML 結構**——
 * GitHub Actions 的 service container 與 compose 的服務宣告本來就不同形狀，
 * 比對結構會逼兩邊寫成同一個樣子，那是不必要的耦合。
 */
describe('架構守則：CI 與本機容器環境必須對齊', () => {
  const ci = ciBody();
  const compose = composeBody();

  it('掃描範圍有效', () => {
    // 任一邊讀不到就代表路徑假設失效，下面的規則會空轉成「一致」
    expect(ci).not.toBe('');
    expect(compose).not.toBe('');
    expect(REQUIRED_COMMANDS.length).toBeGreaterThan(0);
  });

  it('CI 必須包含全部必要檢查', () => {
    const missing = REQUIRED_COMMANDS.filter(
      (r) => !ci.includes(r.command),
    ).map((r) => `  缺少 \`${r.command}\`——${r.why}`);

    expect(
      missing.length === 0
        ? ''
        : `CI 設定缺少必要檢查：\n${missing.join('\n')}\n` +
            'CI 的錯誤方式是靜默的：漏掉的檢查不會有人發現，只會在某天以別的形式爆出來。',
    ).toBe('');
  });

  it('⭐ CI 與 compose.yml 的映像版本必須一致', () => {
    const ciImages = imageVersions(ci);
    const composeImages = imageVersions(compose);

    // 任一邊抓不到映像就代表宣告寫法變了，規則會空轉成「版本一致」
    expect(ciImages.size).toBeGreaterThan(0);
    expect(composeImages.size).toBeGreaterThan(0);

    const mismatched = [...ciImages.entries()]
      .filter(([name]) => composeImages.has(name))
      .filter(([name, versions]) => {
        const all = new Set([...versions, ...(composeImages.get(name) ?? [])]);
        return all.size > 1;
      })
      .map(
        ([name, versions]) =>
          `  ${name}：CI=${[...versions].join(' / ')}、compose=${[
            ...(composeImages.get(name) ?? []),
          ].join(' / ')}`,
      );

    expect(
      mismatched.length === 0
        ? ''
        : `CI 與 compose.yml 使用不同的映像版本：\n${mismatched.join('\n')}\n` +
            '版本不同會產生「本機過、CI 掛」，而差異在版本不在程式碼——那是最難查的一種。',
    ).toBe('');
  });

  it('e2e 的測試庫名必須含 test', () => {
    // globalSetup 的守門會拒絕不含 test 的庫名（防誤連 dev / prod）。
    // 設定裡寫錯的話 job 會紅得莫名其妙，而錯誤訊息指向 globalSetup 不是 CI 設定
    const names = [...ci.matchAll(/DB_TEST_DATABASE:\s*'?"?([\w-]+)/g)].map(
      (m) => m[1],
    );
    expect(names.length).toBeGreaterThan(0);

    const offenders = names.filter((n) => !n.includes('test'));

    expect(
      offenders.length === 0
        ? ''
        : `以下 DB_TEST_DATABASE 不含 "test"：\n${offenders
            .map((n) => `  ${n}`)
            .join('\n')}\n` +
            'e2e 的 globalSetup 守門會直接中止，而錯誤訊息指向 globalSetup 不是 CI 設定。',
    ).toBe('');
  });
});
