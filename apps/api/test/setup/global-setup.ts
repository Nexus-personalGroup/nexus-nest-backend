/**
 * E2E globalSetup（所有 spec 前跑一次）:確保測試庫存在並套用 migration。
 * 守門在 applyE2EDbEnv（庫名須含 "test"），絕不動 dev / prod 庫。
 */
import { execSync } from 'child_process';
import { resolve } from 'path';
import { Client } from 'pg';
import { applyE2EDbEnv } from '../helpers/e2e-env';

export default async function globalSetup(): Promise<void> {
  applyE2EDbEnv();
  const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } =
    process.env;

  if (!DB_DATABASE) {
    throw new Error('DB_DATABASE 未設定——applyE2EDbEnv 應已覆寫為測試庫名');
  }

  // 1. 建測試庫（若不存在）——連 postgres 維護庫，因為 CREATE DATABASE
  //    不能在目標庫自身的連線中執行，且 PostgreSQL 沒有 IF NOT EXISTS
  const client = new Client({
    host: DB_HOST ?? 'localhost',
    port: Number(DB_PORT ?? '5432'),
    user: DB_USERNAME ?? 'postgres',
    password: DB_PASSWORD ?? '',
    database: 'postgres',
  });
  await client.connect();
  const { rowCount } = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [DB_DATABASE],
  );
  if (rowCount === 0) {
    await client.query(
      `CREATE DATABASE ${client.escapeIdentifier(DB_DATABASE)}`,
    );
  }
  await client.end();

  // 2. 套用 migration 到測試庫（用 pnpm exec，不用 npx——避免 pnpm Unknown env config warn）
  const databaseUrl = `postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}`;
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    // 本檔位於 test/setup/，往上兩層才是 apps/api（prisma/schema.prisma 所在）
    cwd: resolve(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
