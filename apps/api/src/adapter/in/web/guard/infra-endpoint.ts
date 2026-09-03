import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_INFRA_ENDPOINT_KEY } from '../decorator/infra-endpoint.decorator';

/**
 * 掛不上裝飾器的基礎設施路徑（第三方 controller 提供）。
 *
 * 每一筆都要寫理由：豁免一旦失去理由就會逐漸長大。
 */
export const INFRA_EXEMPT_PATHS: ReadonlyArray<{
  path: string;
  reason: string;
}> = [
  {
    path: '/api/metrics',
    reason:
      'Prometheus 指標由 @willsoto/nestjs-prometheus 的 controller 提供，掛不上裝飾器。' +
      '抓取端在叢集內部，其來源位址不會在為外部使用者設計的白名單裡；' +
      '真正的來源限制屬於網路層（反向代理 / NetworkPolicy）',
  },
];

/**
 * 判斷請求是否指向基礎設施探針（健康檢查 / 指標）。
 *
 * 兩種明示的表態：`@InfraEndpoint()` 裝飾器，或 `INFRA_EXEMPT_PATHS` 的路徑。
 *
 * **路徑一律精確比對（去除 query string 後），不用 `startsWith`。**
 * 前綴比對的性質是「未來新增的任何同前綴路徑自動豁免」，
 * 而那不會有任何錯誤訊息提醒你——它是一條會自己長大的豁免。
 *
 * @param context - 當前的執行脈絡
 * @param reflector - 用於讀取路由層級的 metadata
 * @returns 是否為基礎設施探針
 */
export const isInfraEndpoint = (
  context: ExecutionContext,
  reflector: Reflector,
): boolean => {
  const marked = reflector.getAllAndOverride<boolean>(IS_INFRA_ENDPOINT_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (marked) return true;

  const request = context.switchToHttp().getRequest<Request>();
  const url = request.originalUrl ?? request.url ?? '';
  // 去掉 query string：Prometheus 帶參數抓取時仍須命中
  const path = url.split('?')[0];
  return INFRA_EXEMPT_PATHS.some((entry) => entry.path === path);
};
