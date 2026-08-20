import { QueryClient } from '@tanstack/react-query';

// 全 app 共用一個 QueryClient；可在這裡集中設定快取策略
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // admin 工具不需要太積極的背景重抓
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
});
