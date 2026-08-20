import { createApiClient, createApiQueryHooks } from '@app/api-client';

import { tokenStorage } from '@/lib/storage';

const API_BASE = '/api/admin';
const REFRESH_PATH = '/auth/refresh';

// 全 app 共用一個 API client：baseUrl 走 Vite proxy 的 /api/admin（後台 API），每次請求即時讀 token
export const apiClient = createApiClient(API_BASE, () => tokenStorage.get());

// 共享 refresh promise：多個並發 401 只觸發一次 refresh
let refreshPromise: Promise<boolean> | null = null;

const refreshAccessToken = async (): Promise<boolean> => {
  const refresh = tokenStorage.getRefresh();
  if (!refresh) return false;

  try {
    const res = await fetch(`${API_BASE}${REFRESH_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as {
      data?: { accessToken?: string; refreshToken?: string };
    };
    const newToken = body.data?.accessToken;
    if (!newToken) return false;
    tokenStorage.set(newToken);
    // Rotation：後端會回新的 refresh token，舊的已經進黑名單
    if (body.data?.refreshToken) {
      tokenStorage.setRefresh(body.data.refreshToken);
    }
    return true;
  } catch {
    return false;
  }
};

const redirectToLogin = (): void => {
  tokenStorage.clear();
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
};

apiClient.use({
  async onResponse({ request, response }) {
    if (response.status !== 401) return response;

    // refresh endpoint 自己 401 表示 refresh token 也失效，直接登出
    if (new URL(request.url).pathname.endsWith(REFRESH_PATH)) {
      redirectToLogin();
      return response;
    }

    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const ok = await refreshPromise;

    if (!ok) {
      redirectToLogin();
      return response;
    }

    // refresh 成功 → 用新 token 重發原請求（此重發刻意走裸 fetch，不再經過 middleware）
    const retried = await fetch(request.url, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers),
        Authorization: `Bearer ${tokenStorage.get()}`,
      },
      body:
        request.method !== 'GET' && request.method !== 'HEAD'
          ? await request.clone().text()
          : undefined,
      credentials: request.credentials,
    });
    // 重發仍 401（例如 refresh 後 token 又被撤銷）→ middleware 不會再次攔截，需手動導向登入
    if (retried.status === 401) {
      redirectToLogin();
    }
    return retried;
  },
});

export const { useApiQuery, useApiMutation, useApiInfiniteQuery } =
  createApiQueryHooks(apiClient);
