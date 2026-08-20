import { readFileSync } from 'fs';
import { join } from 'path';
import { API_ROOT } from './helpers';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');

/**
 * Hard Rule：後端維持 NestJS 的 CommonJS baseline。
 *
 * 在 root 或 apps/api 設 `"type": "module"` 會連鎖破壞 nest CLI、ts-jest 與
 * decorator metadata——這不是改一個設定就能收尾的事。
 *
 * `apps/web` 是**明文例外**（Vite ESM by design），因此不在掃描範圍內，
 * 也不走豁免清單——豁免是給「該修但還沒修」的東西用的，這是設計的一部分。
 */
describe('架構守則：後端維持 CommonJS baseline', () => {
  const targets = [
    { label: 'root package.json', path: join(REPO_ROOT, 'package.json') },
    { label: 'apps/api/package.json', path: join(API_ROOT, 'package.json') },
  ];

  it('掃描範圍有效', () => {
    for (const { path } of targets) {
      expect(readFileSync(path, 'utf8').length).toBeGreaterThan(0);
    }
  });

  it('root 與 apps/api 不得設定 "type": "module"', () => {
    const offenders = targets
      .filter(({ path }) => {
        const pkg: unknown = JSON.parse(readFileSync(path, 'utf8'));
        return (
          typeof pkg === 'object' &&
          pkg !== null &&
          (pkg as { type?: string }).type === 'module'
        );
      })
      .map(({ label }) => `  ${label} 設了 "type": "module"`);

    expect(
      offenders.length === 0
        ? ''
        : `後端 workspace 切換為 ESM 會連鎖破壞 nest CLI / ts-jest / decorator metadata：\n${offenders.join('\n')}`,
    ).toBe('');
  });
});
