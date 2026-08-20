import { Client } from 'pg';
import * as dotenv from 'dotenv';
import pino from 'pino';

dotenv.config({ quiet: true });

const log = pino({
  name: 'create-database',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
});

const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env;

if (!DB_DATABASE) {
  log.error('DB_DATABASE is not set in .env');
  process.exit(1);
}

/**
 * 建立目標資料庫（已存在則略過）
 *
 * PostgreSQL 沒有 `CREATE DATABASE IF NOT EXISTS`，且 CREATE DATABASE 不能在
 * 目標資料庫自身的連線中執行，因此一律先連 `postgres` 維護庫再操作。
 */
const createDatabase = async (): Promise<void> => {
  const client = new Client({
    host: DB_HOST || 'localhost',
    port: parseInt(DB_PORT || '5432', 10),
    user: DB_USERNAME || 'postgres',
    password: DB_PASSWORD || '',
    database: 'postgres',
  });

  await client.connect();

  try {
    log.info('已連線到 PostgreSQL 伺服器');

    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [DB_DATABASE],
    );

    if (rowCount === 0) {
      // 資料庫名稱不能走參數化（PostgreSQL 的 DDL 不接受 bind parameter），
      // 改用 driver 的識別字跳脫，避免名稱含引號時被拼接成任意 SQL
      await client.query(
        `CREATE DATABASE ${client.escapeIdentifier(DB_DATABASE)}`,
      );
      log.info(`資料庫 "${DB_DATABASE}" 建立成功！`);
    } else {
      log.info(`資料庫 "${DB_DATABASE}" 已存在`);
    }
  } catch (error) {
    log.error({ err: error }, '建立資料庫時發生錯誤');
    process.exit(1);
  } finally {
    await client.end();
  }
};

void createDatabase();
