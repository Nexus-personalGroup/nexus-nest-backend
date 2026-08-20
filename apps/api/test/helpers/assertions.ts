import request from 'supertest';
import type { Response } from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ResponseCode } from '@app/shared/constants/response-codes';

/**
 * 斷言業務錯誤回應。
 *
 * code 型別限定為 `ResponseCode`，錯誤碼改名時測試會在 typecheck 階段就紅，
 * 不會因為字面值沒同步而靜默漏測。
 *
 * @param res - supertest 回應
 * @param status - 預期 HTTP status
 * @param code - 預期的業務錯誤碼（ResponseCodes 常數）
 */
export const expectApiError = (
  res: Response,
  status: number,
  code: ResponseCode,
): void => {
  expect(res.status).toBe(status);
  expect(res.body).toMatchObject({ success: false, code });
};

/**
 * 斷言未授權回應。
 *
 * 401 / 403 由 NestJS 的 HttpException 產生，GlobalExceptionFilter 以 class name
 * 推導出 `UNAUTHORIZED` / `FORBIDDEN`，屬框架層代碼、不在 ResponseCodes 中，
 * 因此另立 helper 而非併入 expectApiError。
 *
 * @param res - supertest 回應
 */
export const expectUnauthorized = (res: Response): void => {
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
};

/**
 * 斷言權限不足回應
 * @param res - supertest 回應
 */
export const expectForbidden = (res: Response): void => {
  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({ success: false, code: 'FORBIDDEN' });
};

/** 受保護端點的 HTTP 方法 */
type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/**
 * 為受保護端點產生「未帶 token 應回 401」的測試。
 *
 * 收 app getter 而非 app 實例：既有 e2e 一律在 `beforeAll` 才建立 app，而 describe 區塊
 * 在 jest 收集階段就會執行，此時直接傳實例會拿到 undefined。
 *
 * @param getApp - 回傳已建立的測試 app
 * @param method - HTTP 方法
 * @param path - 完整路徑，例：/api/admin/members
 */
export const describeUnauthorized = (
  getApp: () => NestExpressApplication,
  method: HttpMethod,
  path: string,
): void => {
  it(`未帶 token → 401（${method.toUpperCase()} ${path}）`, async () => {
    const res = await request(getApp().getHttpServer())[method](path);

    expectUnauthorized(res);
  });
};
