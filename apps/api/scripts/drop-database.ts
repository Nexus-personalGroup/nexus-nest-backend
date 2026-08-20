import { Client } from 'pg';
import * as dotenv from 'dotenv';
import pino from 'pino';

dotenv.config({ quiet: true });

const log = pino({
  name: 'drop-database',
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
 * 刪除目標資料庫
 *
 * 與 MySQL 不同，PostgreSQL 拒絕刪除仍有連線的資料庫——開著 Prisma Studio
 * 或 psql 都會讓 DROP 直接失敗。`WITH (FORCE)`（PostgreSQL 13+）會先中斷既有連線。
 */
const dropDatabase = async (): Promise<void> => {
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

    await client.query(
      `DROP DATABASE IF EXISTS ${client.escapeIdentifier(DB_DATABASE)} WITH (FORCE)`,
    );
    log.info(`資料庫 "${DB_DATABASE}" 刪除成功！`);
  } catch (error) {
    log.error({ err: error }, '刪除資料庫時發生錯誤');
    process.exit(1);
  } finally {
    await client.end();
  }
};

void dropDatabase();
