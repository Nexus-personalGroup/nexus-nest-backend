import * as mysql from 'mysql2/promise';
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

const createDatabase = async (): Promise<void> => {
  const connection = await mysql.createConnection({
    host: DB_HOST || 'localhost',
    port: parseInt(DB_PORT || '3306', 10),
    user: DB_USERNAME || 'root',
    password: DB_PASSWORD || '',
  });

  try {
    log.info('已連線到 MySQL 伺服器');

    const [rows] = await connection.query(
      `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [DB_DATABASE],
    );

    if ((rows as mysql.RowDataPacket[]).length === 0) {
      await connection.query(
        `CREATE DATABASE \`${DB_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      log.info(`資料庫 "${DB_DATABASE}" 建立成功！`);
    } else {
      log.info(`資料庫 "${DB_DATABASE}" 已存在`);
    }
  } catch (error) {
    log.error({ err: error }, '建立資料庫時發生錯誤');
    process.exit(1);
  } finally {
    await connection.end();
  }
};

void createDatabase();
