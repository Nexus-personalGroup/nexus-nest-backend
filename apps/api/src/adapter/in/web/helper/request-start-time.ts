import { Request } from 'express';

/**
 * Request 起始時間共用儲存。
 *
 * LoggingInterceptor 在 intercept() 開頭記錄起始時間，GlobalExceptionFilter
 * 在錯誤路徑讀回以計算 execTime。改用 WeakMap 比 mutate request
 * 自帶屬性更明確，且 request 回收後條目自動清除。
 */
const startTimes = new WeakMap<Request, Date>();

export const setRequestStartTime = (request: Request, time: Date): void => {
  startTimes.set(request, time);
};

export const getRequestStartTime = (request: Request): Date | undefined => {
  return startTimes.get(request);
};
