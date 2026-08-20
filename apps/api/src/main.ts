// 必須是第一個 import：在任何模組載入前完成 Sentry.init
import './instrument';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

/**
啟動時丟掉吵雜的 Nest 內建 context
 */
const NOISY_BOOT_CONTEXTS = new Set([
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
  'NestApplication',
]);

class BootFilteredLogger implements LoggerService {
  constructor(private readonly inner: LoggerService) {}

  log(message: unknown, ...params: unknown[]): void {
    const context = this.pickContext(params);
    if (context && NOISY_BOOT_CONTEXTS.has(context)) return;
    this.inner.log?.(message, ...params);
  }
  error(message: unknown, ...params: unknown[]): void {
    this.inner.error?.(message, ...params);
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.inner.warn?.(message, ...params);
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.inner.debug?.(message, ...params);
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.inner.verbose?.(message, ...params);
  }
  fatal(message: unknown, ...params: unknown[]): void {
    this.inner.fatal?.(message, ...params);
  }

  private pickContext(params: unknown[]): string | undefined {
    const last = params[params.length - 1];
    return typeof last === 'string' ? last : undefined;
  }
}

import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import cookieParser = require('cookie-parser');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import express = require('express');
import * as swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import * as yaml from 'js-yaml';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { getEnv } from './infrastructure/validate-env';
import { RedisIoAdapter } from './infrastructure/redis-io.adapter';
import { RedisService } from './infrastructure/redis/redis.service';

const loadSwaggerDocument = (relPath: string): object => {
  try {
    const swaggerPath = join(process.cwd(), relPath);
    return yaml.load(readFileSync(swaggerPath, 'utf8')) as object;
  } catch {
    return {
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0.0' },
      paths: {},
    };
  }
};

const bootstrap = async (): Promise<void> => {
  const env = getEnv();

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    { bufferLogs: true },
  );

  // trust proxy：決定 request.ip 是否採信 X-Forwarded-For。IP 黑白名單與登入失敗封鎖
  // 都依賴 request.ip，設定不當會導致黑名單失效或白名單誤判。字串 env 轉成 Express 接受的型別：
  // 'true'/'false' → boolean、純數字 → 信任跳數、其餘（如 'loopback' / CIDR）→ 原字串。
  const trustProxy = env.TRUST_PROXY;
  app.set(
    'trust proxy',
    trustProxy === 'true'
      ? true
      : trustProxy === 'false'
        ? false
        : /^\d+$/.test(trustProxy)
          ? Number(trustProxy)
          : trustProxy,
  );

  // 設定 HTTP 安全標頭（X-Frame-Options、HSTS、X-Content-Type-Options 等）。
  // 關閉 CSP：本服務為純 API + 獨立前端，且 /api/docs 的 Swagger UI 依賴 inline
  // script/style，預設 CSP 會將其擋下；其餘標頭維持預設保護。
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(cookieParser(env.COOKIE_SECRET));

  // 支援多 origin（以逗號分隔），方便同時放後端、前端 dev、staging 等多個來源。
  // CORS 規範下 origin=`*` 與 credentials: true 互斥，瀏覽器會拒絕 credentialed
  // 請求；遇到 `*` 則自動關閉 credentials，避免 silent failure
  const isWildcard = env.CORS_ORIGIN === '*';
  const corsOrigins = isWildcard
    ? '*'
    : env.CORS_ORIGIN.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  app.enableCors({
    origin:
      Array.isArray(corsOrigins) && corsOrigins.length === 1
        ? corsOrigins[0]
        : corsOrigins,
    credentials: !isWildcard,
  });

  // API 前綴（Swagger UI 路由不受影響）
  app.setGlobalPrefix('api');

  // 本機媒體檔（STORAGE_DRIVER=local）：static 服務上傳目錄，加 nosniff + 嚴格 CSP 防內容嗅探。
  // /media 已在 app.module 的 ServeStaticModule exclude，避免被前端 SPA fallback 攔截。
  if (env.STORAGE_DRIVER === 'local') {
    app.use(
      env.LOCAL_MEDIA_BASE_URL,
      express.static(resolve(env.LOCAL_MEDIA_ROOT), {
        index: false,
        setHeaders: (res: Response) => {
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', "default-src 'none'");
        },
      }),
    );
  }

  // 前後台各一份 swagger：後台 /api/admin/docs（餵 api-client codegen）、前台 /api/front/docs。
  // 兩份都用 serveFiles（而非共用的 swaggerUi.serve）各自綁定文件，
  // 否則第二個掛載的 UI 會載到第一份的 spec（swagger-ui-express 的共用 module 狀態坑）。
  const swaggerUiOptions = {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      docExpansion: 'none',
    },
  };
  const noSwaggerCache = (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    res.setHeader('Pragma', 'no-cache');
    next();
  };
  const mountSwagger = (basePath: string, doc: object): void => {
    // 以 JSON 提供 OpenAPI spec（前端 API client codegen 使用）
    app.use(`${basePath}/docs-json`, (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(JSON.stringify(doc));
    });
    app.use(
      `${basePath}/docs`,
      noSwaggerCache,
      swaggerUi.serveFiles(doc, swaggerUiOptions),
      swaggerUi.setup(doc, swaggerUiOptions),
    );
  };

  mountSwagger(
    '/api/admin',
    loadSwaggerDocument('docs/swagger/admin/openapi.bundle.yaml'),
  );
  mountSwagger(
    '/api/front',
    loadSwaggerDocument('docs/swagger/front/openapi.bundle.yaml'),
  );

  app.useLogger(new BootFilteredLogger(app.get(Logger)));
  app.flushLogs();

  app.enableShutdownHooks();

  // Socket.IO 的跨實例廣播。必須在 listen 之前掛上——WebSocket server 於
  // listen 時建立，之後才換 adapter 是來不及的
  const ioAdapter = new RedisIoAdapter(app, app.get(RedisService));
  await ioAdapter.connect();
  app.useWebSocketAdapter(ioAdapter);

  await app.listen(env.PORT);
  const bootLogger = app.get(Logger);
  bootLogger.log(
    `Swagger 文件（後台）：http://localhost:${env.PORT}/api/admin/docs`,
    'Bootstrap',
  );
  bootLogger.log(
    `Swagger 文件（前台）：http://localhost:${env.PORT}/api/front/docs`,
    'Bootstrap',
  );
  bootLogger.log(`應用程式啟動：${await app.getUrl()}`, 'Bootstrap');
};

bootstrap().catch((err) => {
  // 啟動失敗必須讓程序以非零碼退出,否則容器 / orchestrator 會誤判為健康
  console.error('應用程式啟動失敗', err);
  process.exit(1);
});
