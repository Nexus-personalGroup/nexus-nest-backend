import { Request } from 'express';
import { sanitize, sanitizeUrl } from '@app/infrastructure/sanitize';
import { SystemLogData } from '@app/application/port/out/shared/SaveSystemLogPort';

/**
 * 從 HTTP request 建立 SystemLogData 的公共欄位，
 * 供 LoggingInterceptor（成功路徑）與 GlobalExceptionFilter（錯誤路徑）共用。
 */
export function buildSystemLogData(
  request: Request,
  statusCode: number,
  responsePayload: unknown,
  startTime: Date,
  responseTime: Date,
  overrides?: Partial<SystemLogData>,
): SystemLogData {
  const { method, ip } = request;
  const url = sanitizeUrl(request.url);
  const member = request.member;

  return {
    memberId: member?.sub,
    action: `${method} ${url}`,
    ipAddress: ip,
    method,
    url,
    request: sanitize({
      // 只記錄診斷用 header，避免 Authorization / Cookie 等敏感欄位進入 log
      headers: {
        'user-agent': request.headers['user-agent'],
        'content-type': request.headers['content-type'],
        'x-request-id': request.headers['x-request-id'],
        'x-forwarded-for': request.headers['x-forwarded-for'],
      },
      body: request.body as unknown,
      query: request.query,
    }),
    response: sanitize(responsePayload),
    statusCode,
    execTime: (responseTime.getTime() - startTime.getTime()) / 1000,
    requestTime: startTime,
    responseTime,
    ...overrides,
  };
}
