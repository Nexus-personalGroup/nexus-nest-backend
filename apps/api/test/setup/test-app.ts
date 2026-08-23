import { Test, TestingModule } from '@nestjs/testing';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { AbstractLoader } from '@nestjs/serve-static/dist/loaders/abstract.loader';
import { ExpressLoader } from '@nestjs/serve-static/dist/loaders/express.loader';
import { AppModule } from '@app/app.module';
import { RedisService } from '@app/infrastructure/redis/redis.service';
import { SEND_EMAIL_PORT } from '@app/application/port/out/shared/SendEmailPort';
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
  /**
   * 覆寫寄信 port。
   *
   * 驗證信與密碼重設的 token **只有明文才用得了**，而資料庫只存 sha256 雜湊——
   * 要在測試裡走完整條流程，唯一的取得方式就是攔截寄出去的那封信。
   * 這也順帶驗到了「信裡真的有一個可用的連結」，那是 e2e 之外沒有東西在守的。
   */
  sendEmail?: { sendMail: jest.Mock };
}

/**
 * 攔截寄出的信，並從內文取出 token。
 *
 * 回傳的 `lastToken()` 讀的是**最後一封**：重發之後舊 token 會被作廢，
 * 測試關心的永遠是最新那一封。
 */
export const createMailCatcher = (): {
  sendMail: jest.Mock;
  lastToken: () => string | null;
  lastHtml: () => string;
  count: () => number;
} => {
  const sent: string[] = [];
  const sendMail = jest.fn((payload: { html?: string }) => {
    sent.push(payload.html ?? '');
    return Promise.resolve();
  });
  return {
    sendMail,
    lastToken: () => {
      const html = sent[sent.length - 1] ?? '';
      return /[?&]token=([A-Za-z0-9]+)/.exec(html)?.[1] ?? null;
    },
    lastHtml: () => sent[sent.length - 1] ?? '',
    count: () => sent.length,
  };
};

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
  // presence 走 hash：沒有這一支的話 isOnline() 會炸成 500，
  // 而症狀是「查詢成員概覽回 500」，指不到 mock 少一支方法
  hashGetAll: jest.fn().mockResolvedValue({}),
  // presence 的全域計數走 SCAN；沒有這一支的話儀表板的線上人數會炸成 500
  scanKeys: jest.fn().mockResolvedValue([]),
  // 在線成員的衍生索引；與 scanKeys 同樣的意思——e2e 沒有真的 WS 連線
  setAdd: jest.fn().mockResolvedValue(undefined),
  setRemove: jest.fn().mockResolvedValue(undefined),
  setCard: jest.fn().mockResolvedValue(0),
  setMembers: jest.fn().mockResolvedValue([]),
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

  if (overrides.sendEmail) {
    builder.overrideProvider(SEND_EMAIL_PORT).useValue(overrides.sendEmail);
  }

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
