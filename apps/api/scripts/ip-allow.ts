import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import pino from 'pino';

/**
 * 從命令列把一個 IP 加進白名單。
 *
 * **這是恢復用的出口**：白名單啟用而清單為空時，guard 是 fail-closed，
 * 連能新增白名單的後台頁面自己都會 403——沒有這支就只剩手動下 SQL。
 *
 * 不做成 seed 是因為 seed 每次 `db:seed` 都會跑，
 * 而「要放行哪個 IP」是**因機器而異的參數**，不是可以寫死的初始資料。
 *
 * 用法：`pnpm --filter @app/api ip:allow 203.0.113.4 [說明]`
 */
dotenv.config({ quiet: true });

const log = pino({
  name: 'ip-allow',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
});

const [ipAddress, ...descriptionParts] = process.argv.slice(2);

if (!ipAddress) {
  log.error('用法：pnpm --filter @app/api ip:allow <IP> [說明]');
  process.exit(1);
}

const {
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_USERNAME = 'postgres',
  DB_PASSWORD = '',
  DB_DATABASE,
} = process.env;

if (!DB_DATABASE) {
  log.error('DB_DATABASE 未設定（檢查 .env）');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    host: DB_HOST,
    port: parseInt(DB_PORT, 10),
    user: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_DATABASE,
  }),
});

const run = async (): Promise<void> => {
  const description =
    descriptionParts.join(' ') || '由 ip:allow 從命令列加入（恢復用）';

  // upsert：重跑同一個 IP 不該失敗——被鎖在外面的人會重試
  await prisma.ipWhitelistRecord.upsert({
    where: { ipAddress },
    update: {},
    create: { ipAddress, description },
  });

  const total = await prisma.ipWhitelistRecord.count();
  log.info(`已加入白名單：${ipAddress}（目前共 ${total} 筆）`);
  log.info('api 需重啟才會重新檢查啟動狀態，但白名單本身是即時生效的');
};

run()
  .catch((e) => {
    log.error({ err: e }, '執行失敗');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
