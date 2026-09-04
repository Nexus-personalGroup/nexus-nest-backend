import type { ReactNode } from 'react';

import { useCurrentMember } from '@/lib/use-current-member';
import type { RoleCode } from '@/lib/role-codes';
import { NoPermissionNotice } from './NoPermissionNotice';

type RequireRoleProps = {
  /** 要求的 roleCode（粗粒度 role gate）；目前只用 SUPERADMIN */
  roleCode: RoleCode;
  children: ReactNode;
};

/**
 * Router 層的粗粒度 role gate：roleCode 不符就顯示「沒有存取權限」。
 * 後端 RolesGuard 是真實守門線，這層只負責 UX（避免使用者打到頁面才被 401/403）。
 * me query 載入中時不渲染避免閃爍。
 *
 * **顯示訊息而非導頁**：與 `RequirePermission` 保持同一種表現——
 * 兩種「沒權限」行為並存比任何一種單獨存在都糟，下一個人要先查才知道用哪個。
 * 代價是洩漏「這個頁面存在」，但 sidebar 已經藏著它，
 * 會手動輸入該網址的人本來就知道，實際資訊量接近零。
 */
export const RequireRole = ({ roleCode, children }: RequireRoleProps) => {
  const { roleCode: currentRoleCode, isLoading } = useCurrentMember();

  if (isLoading) return null;
  if (currentRoleCode !== roleCode) {
    return <NoPermissionNotice required={roleCode} />;
  }
  return <>{children}</>;
};
