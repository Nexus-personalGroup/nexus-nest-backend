import helmet from 'helmet';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * 兩份 Swagger 的掛載位置與其 bundle 來源。
 *
 * **同時是 CSP 豁免範圍的唯一來源**：掛在哪、豁免哪由同一張表決定。
 * 分成兩處寫的話，漏掉其中一條的症狀是「那份文件打不開」——
 * 會被當成 Swagger 壞掉去查，沒有人會想到是 CSP。
 */
export const SWAGGER_SIDES = [
  { basePath: '/api/admin', bundle: 'docs/swagger/admin/openapi.bundle.yaml' },
  { basePath: '/api/front', bundle: 'docs/swagger/front/openapi.bundle.yaml' },
] as const;

/** Swagger UI 的路徑（含它載入的靜態資源），CSP 於此放寬 */
const DOCS_PATHS = SWAGGER_SIDES.map((side) => `${side.basePath}/docs`);

/**
 * 判斷請求路徑是否屬於 Swagger UI
 *
 * 用「完全相等或以 `<base>/` 開頭」而非 `startsWith(base)`：
 * 後者會連 `/docs-json` 一起吃進來，而那是 JSON 不是 UI，不需要放寬。
 * @param path - 請求路徑
 * @returns 屬於 Swagger UI 回 true
 */
export const isDocsPath = (path: string): boolean =>
  DOCS_PATHS.some((docs) => path === docs || path.startsWith(`${docs}/`));

/**
 * 掛上 HTTP 安全標頭（X-Frame-Options、HSTS、X-Content-Type-Options、CSP 等）
 *
 * CSP 只在 Swagger UI 的路徑放寬（它依賴 inline script/style），其餘一律套預設。
 * **豁免的範圍必須跟著它的理由走**：先前是全域關閉，理由寫「本服務為純 API +
 * 獨立前端」——那個前提在單一埠部署模式（ServeStaticModule + WEB_STATIC_ROOT）
 * 加入時就失效了。那個模式下後台 SPA 由同一個 Express 吐出，
 * 全域關閉等於整個後台介面都沒有 CSP，而這不會有任何錯誤訊息。
 *
 * 用分支而非 `app.use(path, helmet(...))` 疊加：後者只是「前綴符合才跑」，
 * 不會讓後面的全域 helmet 跳過，文件路徑仍會被加回 CSP。
 *
 * 不依 `NODE_ENV` 切換：開發與正式跑不同的 CSP，
 * 等於把違規延到正式環境才發現。
 *
 * **與 e2e 共用同一支**：`createE2EApp` 也呼叫它，
 * 否則測試跑的是一組沒有安全標頭的 app，任何 header 斷言都是空的。
 *
 * @param app - Nest 應用實例
 */
export const applySecurityHeaders = (app: INestApplication): void => {
  const helmetDefault = helmet();
  const helmetForDocs = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    isDocsPath(req.path)
      ? helmetForDocs(req, res, next)
      : helmetDefault(req, res, next),
  );
};
