import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useCurrentMember } from '@/lib/use-current-member';
import type { RoleCode } from '@/lib/role-codes';

type RequireRoleProps = {
  /** 要求的 roleCode（粗粒度 role gate）；目前只用 SUPERADMIN */
  roleCode: RoleCode;
  /** 不通過時導向的路徑；預設 `/` */
  fallback?: string;
  children: ReactNode;
};

/**
 * Router 層的粗粒度 role gate：roleCode 不符就導向 fallback。
 * 後端 RolesGuard 是真實守門線，這層只負責 UX（避免使用者打到頁面才被 401/403）。
 * me query 載入中時不渲染避免閃爍
 */
export const RequireRole = ({
  roleCode,
  fallback = '/',
  children,
}: RequireRoleProps) => {
  const { roleCode: currentRoleCode, isLoading } = useCurrentMember();

  if (isLoading) return null;
  if (currentRoleCode !== roleCode) {
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
};
