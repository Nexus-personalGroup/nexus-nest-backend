import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';

dotenv.config({ quiet: true });

// production 擋關：避免誤把測試資料 upsert 到生產庫
if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SEED) {
  console.error(
    'seed-runner: 生產環境禁止執行，請設定 ALLOW_PROD_SEED=1 後再試',
  );
  process.exit(1);
}

const log = pino({
  name: 'seed-runner',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
});

const {
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_USERNAME = 'postgres',
  DB_PASSWORD = '',
  DB_DATABASE,
} = process.env;

if (!DB_DATABASE) {
  log.error('DB_DATABASE is not set in .env');
  process.exit(1);
}

// Prisma v7 PostgreSQL adapter 接受 pg.PoolConfig，用物件組態不用 URL
// UTC 由 schema 的 @db.Timestamptz(3) 保證，不需要 driver 層的時區參數
const adapter = new PrismaPg({
  host: DB_HOST,
  port: parseInt(DB_PORT, 10),
  user: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_DATABASE,
});

const prisma = new PrismaClient({ adapter });

const run = async (): Promise<void> => {
  const seedsDir = path.join(__dirname, '../seeds');

  const files = fs
    .readdirSync(seedsDir)
    .filter((f) => f.endsWith('.ts'))
    .sort(); // timestamp prefix 確保順序

  log.info(`找到 ${files.length} 個 seed 檔案`);

  for (const file of files) {
    const history = await prisma.seedHistoryRecord.findUnique({
      where: { seedName: file },
    });

    if (history) {
      log.info(`跳過 ${file}（已執行過）`);
      continue;
    }

    log.info(`執行 ${file}`);
    const seedModule = (await import(path.join(seedsDir, file))) as {
      default: (prisma: PrismaClient) => Promise<void>;
    };
    await seedModule.default(prisma);

    await prisma.seedHistoryRecord.create({ data: { seedName: file } });
    log.info(`記錄 ${file} 執行完成`);
  }

  log.info('全部執行完成！');
};

run()
  .catch((e) => {
    log.error({ err: e }, '執行失敗');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
