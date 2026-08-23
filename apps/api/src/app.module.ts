import { Module, RequestMethod } from '@nestjs/common';
import type { Request } from 'express';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { RedisThrottlerStorage } from './infrastructure/redis/redis-throttler.storage';
import { RedisService } from './infrastructure/redis/redis.service';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './modules/redis.module';
import { FeatureFlagModule } from './modules/feature-flag.module';
import { AuthLogModule } from './modules/auth-log.module';
import { SecurityModule } from './modules/admin/security.module';
import { RecaptchaModule } from './modules/recaptcha.module';
import { SystemLogModule } from './modules/system-log.module';
import { EmailModule } from './modules/email.module';
import { FirebaseModule } from './modules/firebase.module';
import { StorageModule } from './modules/storage.module';
import { MemberModule } from './modules/admin/member.module';
import { AuthModule } from './modules/admin/auth.module';
import { JwtModule } from './modules/jwt.module';
import { RoleModule } from './modules/admin/role.module';
import { AttachmentModule } from './modules/admin/attachment.module';
import { PingModule } from './modules/front/ping.module';
import { GlobalExceptionFilter } from './adapter/in/web/filter/GlobalExceptionFilter';
import { LoggingInterceptor } from './adapter/in/web/interceptor/LoggingInterceptor';
import { TransformInterceptor } from './adapter/in/web/interceptor/TransformInterceptor';
import { IpBlacklistGuard } from './adapter/in/web/guard/IpBlacklistGuard';
import { IpWhitelistGuard } from './adapter/in/web/guard/IpWhitelistGuard';
import { SessionIdleGuard } from './adapter/in/web/guard/SessionIdleGuard';
import { JwtAuthGuard } from './adapter/in/web/guard/JwtAuthGuard';
import { RolesGuard } from './adapter/in/web/guard/RolesGuard';
import { PermissionsGuard } from './adapter/in/web/guard/PermissionsGuard';
import { HealthModule } from './modules/health.module';
import { ChatWsModule } from './modules/chat-ws.module';
import { MemberContextModule } from './modules/member-context.module';
import { SchedulerModule } from './modules/scheduler.module';
import { FrontChatRoomModule } from './modules/front/chat-room.module';
import { FrontChatReportModule } from './modules/front/chat-report.module';
import { ModerationModule } from './modules/admin/moderation.module';
import { FrontAuthModule } from './modules/front/auth.module';
import { DashboardModule } from './modules/admin/dashboard.module';
import { SentryModule } from '@sentry/nestjs/setup';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { getEnv } from './infrastructure/validate-env';

/**
 * 解析前端打包產物（apps/web/dist）的根目錄。
 *
 * 預設相對 api 編譯輸出往上找 apps/web/dist；可用環境變數 WEB_STATIC_ROOT 覆寫部署路徑。
 * 找不到 index.html（dev 尚未 build 前端、或純 API 部署）時回 null，呼叫端據此略過掛載。
 *
 * @returns 含 index.html 的靜態根目錄絕對路徑，或 null
 */
const resolveWebStaticRoot = (): string | null => {
  const { WEB_STATIC_ROOT } = getEnv();
  const root = WEB_STATIC_ROOT
    ? resolve(WEB_STATIC_ROOT)
    : join(__dirname, '..', '..', 'web', 'dist');
  return existsSync(join(root, 'index.html')) ? root : null;
};

@Module({
  imports: [
    // Pino logger（request-level logging + pino-pretty / pino-roll）
    LoggerModule.forRootAsync({
      useFactory: () => {
        const env = getEnv();
        const isDev = env.NODE_ENV !== 'production';
        const isTest = env.NODE_ENV === 'test';
        return {
          // Express 5 使用 named wildcard，避免 LegacyRouteConverter 警告
          forRoutes: [{ path: '/*path', method: RequestMethod.ALL }],
          pinoHttp: {
            genReqId: () => randomUUID(),
            level: env.LOG_LEVEL,
            name: env.SERVICE_NAME,
            // 縱深防禦：serializers.req 目前只留 id/method/url，body 本來就不會進 log。
            // 但只要有人為了除錯還原 serializer，這份清單就是唯一的防線——
            // pino 的 redact 不支援子字串比對，只能逐一列舉（與 sanitize.ts 的策略不同）。
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.newPassword',
                'req.body.oldPassword',
                'req.body.confirmPassword',
                'req.body.token',
                'req.body.refreshToken',
                'req.body.accessToken',
              ],
              censor: '[REDACTED]',
            },
            // 預設 serializer 會 dump 整包 req/res（含所有 headers、cookies），dev 看不清楚。
            // 只保留必要欄位，需要除錯時改 LOG_LEVEL=debug 並還原這段
            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res: { statusCode: number }) => ({
                statusCode: res.statusCode,
              }),
            },
            transport: {
              targets: [
                ...(isDev
                  ? [
                      {
                        target: 'pino-pretty',
                        options: {
                          colorize: true,
                          translateTime: 'HH:MM:ss',
                          // 把 context 移到訊息前綴，並隱藏 pid / hostname 與第二行的 context
                          messageFormat: '[{context}] {msg}',
                          ignore: 'pid,hostname,context',
                          singleLine: true,
                        },
                        level: env.LOG_LEVEL,
                      },
                    ]
                  : []),
                // test 環境不寫入 log 檔案，避免 CI 產生無用的 logs/
                ...(!isTest
                  ? [
                      {
                        target: 'pino-roll',
                        options: {
                          file: 'logs/error.log',
                          limit: { size: '5m', count: 10 },
                          mkdir: true,
                        },
                        level: 'error',
                      },
                      {
                        target: 'pino-roll',
                        options: {
                          file: 'logs/combined.log',
                          limit: { size: '5m', count: 10 },
                          mkdir: true,
                        },
                        level: env.LOG_LEVEL,
                      },
                    ]
                  : []),
              ],
            },
          },
        };
      },
    }),
    // 全域速率限制：使用 Redis 儲存支援水平擴展
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => {
        const env = getEnv();
        return {
          throttlers: [
            {
              ttl: env.COMMON_RATE_LIMIT_WINDOW_MS,
              limit: env.COMMON_RATE_LIMIT_MAX_REQUESTS,
            },
          ],
          storage: new RedisThrottlerStorage(redis),
          // metrics 端點供 Prometheus 定期輪詢，與 health 探針（@SkipThrottle）一樣不應受速率限制
          skipIf: (context) => {
            const request = context.switchToHttp().getRequest<Request>();
            return (request.originalUrl ?? request.url ?? '').startsWith(
              '/api/metrics',
            );
          },
        };
      },
    }),
    PrismaModule,
    RedisModule,
    FeatureFlagModule,
    AuthLogModule,
    SecurityModule,
    RecaptchaModule,
    SystemLogModule,
    EmailModule,
    FirebaseModule,
    StorageModule,
    RoleModule,
    MemberModule,
    AuthModule,
    AttachmentModule,
    // 前台（公開）模組：與後台平鋪 import，路由前綴 /api/front
    PingModule,
    FrontChatRoomModule,
    FrontChatReportModule,
    ModerationModule,
    FrontAuthModule,
    DashboardModule,
    // 全域 JwtAuthGuard（APP_GUARD）需在 AppModule 直接取得 JwtService
    JwtModule,
    HealthModule,
    // token → MemberContext 的共用判定，HTTP guard 與 WS gateway 都從這裡取得同一份實作
    MemberContextModule,
    // WebSocket 連線層（不分 admin / front 側，見 chat-ws.module.ts）
    ChatWsModule,
    // 排程：ScheduleModule.forRoot() 全域註冊 SchedulerRegistry；SchedulerModule 宣告各排程器
    ScheduleModule.forRoot(),
    SchedulerModule,
    // 單一埠部署：由 api 一併服務前端打包產物（apps/web/dist）。
    // exclude 排除 /api，讓 API 與 Swagger 走原本路由、SPA 深層路由 fallback 回 index.html；
    // useFactory 在 init 時才偵測 dist，前端未 build 時回空陣列等同不掛載（dev 走 Vite 不受影響）。
    ServeStaticModule.forRootAsync({
      useFactory: () => {
        const rootPath = resolveWebStaticRoot();
        if (!rootPath) return [];
        // 排除 /api 與（local driver 時）媒體路徑，讓它們不被 SPA fallback 攔截
        const env = getEnv();
        const exclude = ['/api/{*path}'];
        if (env.STORAGE_DRIVER === 'local') {
          const base = env.LOCAL_MEDIA_BASE_URL.replace(/\/$/, '');
          exclude.push(`${base}/{*path}`);
        }
        return [{ rootPath, exclude }];
      },
    }),
    // Sentry NestJS 整合（事件實際送出與否由 instrument.ts 的 enabled 控制）
    SentryModule.forRoot(),
    // Prometheus metrics：flag 開啟才掛載，曝露 GET /api/metrics（含 Node/process 預設指標）
    ...(getEnv().APPLICATION_METRICS_ENABLED
      ? [PrometheusModule.register({ defaultMetrics: { enabled: true } })]
      : []),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: IpBlacklistGuard },
    { provide: APP_GUARD, useClass: IpWhitelistGuard },
    // 全域認證：排在 SessionIdleGuard 前（SessionIdle 依賴 request.member）。
    // 公開路由用 @Public() 跳過；預設拒絕，避免新 controller 漏掛認證即裸奔。
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全域授權：與認證比照辦理。兩者都是「沒有對應裝飾器就放行」，全域化與逐一
    // @UseGuards 行為完全等價，但消滅了「漏掛 = 沉默的授權繞過」這整類 bug——
    // 漏掛時裝飾器會變成純註解，端點對任何已登入者開放，沒有錯誤訊息、測試照樣綠。
    // 必須排在 JwtAuthGuard 之後：兩者都依賴它填入的 request.member。
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: SessionIdleGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
