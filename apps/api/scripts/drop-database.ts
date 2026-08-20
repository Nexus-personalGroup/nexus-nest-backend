import * as mysql from 'mysql2/promise';
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

const dropDatabase = async (): Promise<void> => {
  const connection = await mysql.createConnection({
    host: DB_HOST || 'localhost',
    port: parseInt(DB_PORT || '3306', 10),
    user: DB_USERNAME || 'root',
    password: DB_PASSWORD || '',
  });

  try {
    log.info('已連線到 MySQL 伺服器');

    await connection.query(`DROP DATABASE IF EXISTS \`${DB_DATABASE}\``);
    log.info(`資料庫 "${DB_DATABASE}" 刪除成功！`);
  } catch (error) {
    log.error({ err: error }, '刪除資料庫時發生錯誤');
    process.exit(1);
  } finally {
    await connection.end();
  }
};

void dropDatabase();
