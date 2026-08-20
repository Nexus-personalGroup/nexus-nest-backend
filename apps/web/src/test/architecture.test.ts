/**
 * 前端架構守則測試。
 *
 * **為何放在 `src/` 而非與 api 對稱的 `apps/web/test/`**：`tsconfig.app.json` 的 include
 * 只有 `src`、`tsconfig.node.json` 只有 `vite.config.ts`——放到 `test/` 會落在所有 tsconfig
 * 之外，`pnpm typecheck` 掃不到，而 vitest 用 esbuild 轉譯**不做型別檢查**，型別錯誤會靜默通過。
 * 本檔第一版就因為誤用 node 的 fs / __dirname 被 typecheck 攔下——正是因為它在 `src` 內。
 * 要搬到 `test/` 得另加 `tsconfig.test.json` 並掛進 references，為了目錄對稱動型別環境不划算。
 */
import { describe, it, expect } from 'vitest';

/** 取出 import / export ... from '路徑' 的模組路徑 */
const IMPORT_PATTERN =
  /^\s*(?:import|export)\s[^'"]*?['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/;

type Violation = { file: string; line: number; text: string };

/**
 * 以 Vite 的 import.meta.glob 取得原始碼內容。
 *
 * 刻意不用 node 的 fs：`tsconfig.app.json` 的 types 只有 `vite/client`，
 * 引入 fs / path / __dirname 會讓前端的型別環境被迫加上 node 型別。
 */
const sources = import.meta.glob('/src/routes/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * 前端分層守則：各 route 彼此獨立。
 *
 * 這條規則無法用 eslint 的靜態 glob 表達——`no-restricted-imports` 的 pattern 是固定的，
 * 無法表達「除了自己所屬的 route 以外的其他 route」。與後端一致的分工判準：
 * eslint 表達得了的（下層不得相依 routes、ui 不得相依業務層）留在 eslint.config.js，
 * 表達不了的放這裡。
 */
describe('架構守則：前端 route 隔離', () => {
  const files = Object.keys(sources).filter((f) => !f.includes('.test.'));

  /** 由檔案路徑取出所屬 route 名稱，例：/src/routes/members/page.tsx → members */
  const routeOf = (file: string): string | null =>
    /^\/src\/routes\/([^/]+)\//.exec(file)?.[1] ?? null;

  const routeNames = new Set(
    files.map(routeOf).filter((name): name is string => name !== null),
  );

  it('掃描範圍有效', () => {
    // 目錄改名或 glob 失效時先紅，否則「0 個違規」會被誤讀成合規
    expect(files.length).toBeGreaterThan(0);
    expect(routeNames.size).toBeGreaterThan(1);
  });

  it('route 之間不得互相 import', () => {
    const offenders: Violation[] = [];

    for (const file of files) {
      const own = routeOf(file);
      if (!own) continue;

      sources[file].split('\n').forEach((text, index) => {
        const matched = IMPORT_PATTERN.exec(text);
        const path = matched ? (matched[1] ?? matched[2]) : null;
        if (!path) return;

        // 別名（@/routes/x）與相對路徑（../x/…）兩種寫法都要涵蓋；
        // 相對路徑的上一層可能是 components / lib 等非 route 目錄，故比對 routeNames
        const target =
          /routes\/([^/'"]+)/.exec(path)?.[1] ??
          /^\.\.\/([^/]+)\//.exec(path)?.[1];

        if (target && target !== own && routeNames.has(target)) {
          offenders.push({ file, line: index + 1, text: text.trim() });
        }
      });
    }

    expect(
      offenders.length === 0
        ? ''
        : `route 之間互相 import：共用邏輯請下沉到 src/lib 或 src/components（共 ${offenders.length} 處）\n` +
            offenders.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join('\n'),
    ).toBe('');
  });
});
