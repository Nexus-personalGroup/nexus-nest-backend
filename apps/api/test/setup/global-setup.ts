/**
 * E2E globalSetup（所有 spec 前跑一次）:確保測試庫存在並套用 migration。
 * 守門在 applyE2EDbEnv（庫名須含 "test"），絕不動 dev / prod 庫。
 */
import { execSync } from 'child_process';
import { resolve } from 'path';
import * as mysql from 'mysql2/promise';
import { applyE2EDbEnv } from '../helpers/e2e-env';

export default async function globalSetup(): Promise<void> {
  applyE2EDbEnv();
  const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } =
    process.env;

  // 1. 建測試庫（若不存在）——不選 database 連線，只發 CREATE DATABASE
  const connection = await mysql.createConnection({
    host: DB_HOST ?? 'localhost',
    port: Number(DB_PORT ?? '3306'),
    user: DB_USERNAME ?? 'root',
    password: DB_PASSWORD ?? '',
  });
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await connection.end();

  // 2. 套用 migration 到測試庫（用 pnpm exec，不用 npx——避免 pnpm Unknown env config warn）
  const databaseUrl = `mysql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}`;
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    // 本檔位於 test/setup/，往上兩層才是 apps/api（prisma/schema.prisma 所在）
    cwd: resolve(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
