import { useApiQuery } from '@/api/client';

/**
 * 取得目前登入的會員資料（含 permissions、roleCode、sub 等）。
 * 用 staleTime 5 分鐘避免每次 mount 都打 /me；後端有 MemberContext 快取，亦不會壓力。
 */
export const useCurrentMember = () => {
  const query = useApiQuery('GET', '/me', undefined, {
    staleTime: 5 * 60 * 1000,
  });

  return {
    member: query.data,
    permissions: query.data?.permissionCodes ?? [],
    sub: query.data?.id,
    /** 角色代碼（roleCode）；給 sidebar 等粗粒度 role gate 用 */
    roleCode: query.data?.roleCode,
    isLoading: query.isLoading,
  };
};
