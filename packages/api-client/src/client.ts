import createClient, { type Client } from 'openapi-fetch';

import type { paths } from './schema';

export type ApiPaths = paths;
export type ApiClient = Client<paths>;

type TokenGetter = () => string | null | undefined;

/**
 * 建立 openapi-fetch client，並注入 Authorization middleware
 * @param baseUrl - 後端 API 前綴（dev 端走 Vite proxy 一般填 '/api'）
 * @param getToken - 取 access token 的函式，每次請求即時呼叫，token 變動會立即生效
 */
export const createApiClient = (
  baseUrl: string,
  getToken?: TokenGetter,
): ApiClient => {
  const client = createClient<paths>({ baseUrl });

  if (getToken) {
    client.use({
      onRequest({ request }) {
        const token = getToken();
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
        return request;
      },
    });
  }

  return client;
};
