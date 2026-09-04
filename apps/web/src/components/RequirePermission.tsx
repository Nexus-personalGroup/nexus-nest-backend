import type { ReactNode } from 'react';

import { useCurrentMember } from '@/lib/use-current-member';
import type { PermissionCode } from '@/lib/permission-codes';
import { NoPermissionNotice } from './NoPermissionNotice';

type RequirePermissionProps = {
  /** 進入這條路由所需的權限碼 */
  code: PermissionCode;
  children: ReactNode;
};

/**
 * Router 層的細粒度權限 gate：權限不足就顯示「沒有存取權限」。
 *
 * **sidebar 的隱藏不是保護**：沒有這道守衛的話，手動輸入網址就進得去，
 * 然後頁面裡每一支 API 被後端擋成 403——使用者看到的是空殼配一串錯誤。
 *
 * 後端 `PermissionsGuard` 是真實守門線，這層只負責 UX；
 * 這支元件消失只會讓使用者看到一堆 403，不會讓資料外洩。
 *
 * me query 載入中時不渲染避免閃爍。
 */
export const RequirePermission = ({
  code,
  children,
}: RequirePermissionProps) => {
  const { permissions, isLoading } = useCurrentMember();

  if (isLoading) return null;
  if (!permissions.includes(code)) {
    return <NoPermissionNotice required={code} />;
  }
  return <>{children}</>;
};
