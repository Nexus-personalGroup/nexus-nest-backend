import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * 檢查 swagger bundle 與 api-client 產物是否為最新。
 *
 * 與架構測試的分工：架構測試比對「路由集合」（毫秒級，每次 pnpm test 都跑），
 * 本腳本重新產生產物後比對「完整內容」，涵蓋路由沒變但 request/response schema
 * 改了的情形。產物一律寫入暫存目錄 —— 一個會偷偷改動工作目錄的檢查指令，
 * 在 CI 或 pre-commit 下會造成難以察覺的副作用。
 */

const API_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(API_ROOT, '..', '..');
const SIDES = ['admin', 'front'] as const;
const GENERATED_CLIENT = path.join(
  REPO_ROOT,
  'packages/api-client/src/schema.ts',
);

/** 執行外部工具；失敗時標記為工具問題而非產物過期 */
const run = (command: string, args: string[], cwd: string): void => {
  try {
    execFileSync(command, args, { cwd, stdio: 'pipe' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`swagger:check 工具執行失敗：${command} ${args.join(' ')}`);
    console.error(detail);
    process.exit(2);
  }
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swagger-check-'));
const stale: string[] = [];

try {
  for (const side of SIDES) {
    const source = path.join(API_ROOT, `docs/swagger/${side}/openapi.yaml`);
    const current = path.join(
      API_ROOT,
      `docs/swagger/${side}/openapi.bundle.yaml`,
    );
    const fresh = path.join(tmpDir, `${side}.bundle.yaml`);

    run(
      'pnpm',
      ['exec', 'swagger-cli', 'bundle', source, '-o', fresh, '-t', 'yaml'],
      API_ROOT,
    );

    if (fs.readFileSync(fresh, 'utf8') !== fs.readFileSync(current, 'utf8')) {
      stale.push(`  docs/swagger/${side}/openapi.bundle.yaml`);
    }
  }

  // api-client 目前只生成 admin 側型別
  const freshClient = path.join(tmpDir, 'schema.ts');
  run(
    'pnpm',
    [
      '--filter',
      '@app/api-client',
      'exec',
      'openapi-typescript',
      path.join(API_ROOT, 'docs/swagger/admin/openapi.bundle.yaml'),
      '-o',
      freshClient,
    ],
    REPO_ROOT,
  );

  if (
    fs.readFileSync(freshClient, 'utf8') !==
    fs.readFileSync(GENERATED_CLIENT, 'utf8')
  ) {
    stale.push('  packages/api-client/src/schema.ts');
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (stale.length > 0) {
  console.error('以下產物已過期（來源已變更但未重新產生）：');
  console.error(stale.join('\n'));
  console.error(
    '\n請執行：pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate',
  );
  process.exit(1);
}

console.log('swagger:check 通過 —— bundle 與 api-client 產物皆為最新');
