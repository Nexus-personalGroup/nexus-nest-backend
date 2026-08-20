import { Test, TestingModule } from '@nestjs/testing';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { AbstractLoader } from '@nestjs/serve-static/dist/loaders/abstract.loader';
import { ExpressLoader } from '@nestjs/serve-static/dist/loaders/express.loader';
import { AppModule } from '@app/app.module';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import { SAVE_SYSTEM_LOG_PORT } from '@app/application/port/out/shared/SaveSystemLogPort';

export interface TestAppOverrides {
  redis?: ReturnType<typeof createMockRedis>;
  saveSystemLog?: Record<string, unknown>;
  /**
   * 強制 ServeStaticModule 使用 ExpressLoader。
   *
   * 測試以 compile() 後才 createNestApplication 的兩段式建立 app，loader factory 在尚無
   * httpAdapter 時會選到 NoopLoader（不服務靜態檔）；驗證單一埠靜態服務時設 true 對齊生產。
   */
  forceServeStatic?: boolean;
}

/**
 * 每次呼叫回傳全新獨立的 Redis mock 實例，
 * 避免多個 E2E spec 共用同一物件導致狀態汙染。
 */
export const createMockRedis = () => ({
  isAvailable: true,
  keyPrefix: 'nest:',
  onModuleInit: jest.fn(),
  onModuleDestroy: jest.fn(),
  ping: jest.fn().mockResolvedValue(true),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  addToBlacklist: jest.fn().mockResolvedValue(undefined),
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
  getBlacklistReason: jest.fn().mockResolvedValue(null),
  throttleIncrement: jest.fn().mockResolvedValue(1),
  increment: jest.fn().mockResolvedValue(1),
});

/** 每次呼叫回傳全新的 SaveSystemLog mock 實例 */
export const createMockSaveSystemLog = () => ({
  saveSystemLog: jest.fn().mockResolvedValue(undefined),
});

/**
 * 建立 NestExpressApplication 測試實例。
 * 集中管理 global prefix 等共用設定，
 * 避免各 E2E spec 重複撰寫。
 *
 * 使用方式：
 * ```typescript
 * const mockRedis = createMockRedis();
 * const { app } = await createE2EApp({ redis: mockRedis });
 * ```
 */
export async function createE2EApp(overrides: TestAppOverrides = {}): Promise<{
  app: NestExpressApplication;
  moduleRef: TestingModule;
}> {
  const mockRedis = overrides.redis ?? createMockRedis();
  const mockLog = overrides.saveSystemLog ?? createMockSaveSystemLog();

  // PrismaService 不 override → 用真 PrismaService，連到 setup-env.e2e 指定的 *_test 庫
  const builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(RedisService)
    .useValue(mockRedis)
    .overrideProvider(SAVE_SYSTEM_LOG_PORT)
    .useValue(mockLog);

  if (overrides.forceServeStatic) {
    builder.overrideProvider(AbstractLoader).useClass(ExpressLoader);
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>(
    new ExpressAdapter(),
    { forceCloseConnections: true },
  );
  app.setGlobalPrefix('api');
  await app.init();

  return { app, moduleRef };
}
