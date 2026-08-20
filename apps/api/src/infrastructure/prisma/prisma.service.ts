import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { getEnv } from '../validate-env';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const env = getEnv();
    // Prisma v7 MariaDB adapter 用物件組態，不用 URL
    // 密碼含特殊字元時 URL parser 會炸，且 timezone: 'Z' 在 URL 形式不穩定
    const adapter = new PrismaMariaDb({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_DATABASE,
      timezone: 'Z',
      // MySQL 9 預設 caching_sha2_password，非 TLS 連線冷快取首次認證需向 server 取 RSA 公鑰；
      // 本機 localhost 開發未啟用 TLS、不允許取回公鑰時會 ER_CANNOT_RETRIEVE_RSA_KEY 連不上
      allowPublicKeyRetrieval: true,
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
