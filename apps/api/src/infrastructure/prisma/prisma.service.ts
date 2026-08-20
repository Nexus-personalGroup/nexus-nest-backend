import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getEnv } from '../validate-env';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const env = getEnv();
    // Prisma v7 PostgreSQL adapter 接受 pg.PoolConfig，用物件組態而不用 URL：
    // 密碼含特殊字元時 URL parser 會炸，且 e2e 的資料庫隔離靠覆寫 DB_DATABASE，
    // 改成 URL 就得退化成字串拼接再重新解析。
    //
    // 這裡不設任何時區參數：UTC 由 schema 的 @db.Timestamptz(3) 在欄位層保證。
    // 若改用不帶時區的 timestamp，pg driver 會以「Node 行程的本機時區」解析，
    // CI 與開發機會靜默相差數小時而不報錯。
    const adapter = new PrismaPg({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_DATABASE,
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    const env = getEnv();
    this.logger.log(
      `資料庫連線成功 {"host":"${env.DB_HOST}","database":"${env.DB_DATABASE}"}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
