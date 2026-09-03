import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { TriangleAlert } from 'lucide-react';

import { DataTablePagination } from '@/components/data-table/DataTablePagination';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { useApiMutation } from '@/api/client';
import { useAccountLocksQuery } from './hooks/use-account-locks-query';
import { useAccountLocksUrlState } from './hooks/use-account-locks-url-state';
import { AccountLocksSearchBar } from './components/AccountLocksSearchBar';
import {
  AccountLocksTable,
  type AccountLockRow,
} from './components/AccountLocksTable';

/**
 * 帳號鎖定列表（SUPERADMIN only）。
 *
 * **解鎖沿用既有的 `POST /security/unlock-account`**，不另開端點：
 * 列表本來就拿得到 email，而兩支做同一件事的端點會各自演化
 * （一支加了稽核、另一支沒有），呼叫端選錯不會有人發現。
 */
export const AccountLocksPage = () => {
  const url = useAccountLocksUrlState();
  const queryClient = useQueryClient();
  const listQuery = useAccountLocksQuery({
    page: url.page,
    limit: url.limit,
    search: url.search,
    status: url.status,
  });

  const [unlockTarget, setUnlockTarget] = useState<AccountLockRow | null>(null);

  const unlock = useApiMutation('POST', '/security/unlock-account', {
    onSuccess: () => {
      toast.success('已解鎖');
      void queryClient.invalidateQueries({
        queryKey: ['GET', '/security/locks'],
      });
      setUnlockTarget(null);
    },
    onError: (err) => {
      toast.error(err.message || '解鎖失敗');
      setUnlockTarget(null);
    },
  });

  const handleUnlock = useCallback((row: AccountLockRow) => {
    setUnlockTarget(row);
  }, []);

  const rows = listQuery.data?.list ?? [];
  const meta = listQuery.data?.meta;
  // 功能關閉時系統不會產生任何鎖定紀錄，清單於是永遠是空的——
  // 而空狀態的「目前沒有帳號被鎖定」在這種情況下是**錯的**：
  // 不是沒有人被鎖，是根本不會鎖。兩者的意義相反，畫面必須分得出來
  const lockDisabled = listQuery.data?.lockEnabled === false;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">帳號鎖定</h1>
        {/*
          副標描述的是**啟用後**的行為，所以功能關閉時不能用現在式陳述——
          「連續登入失敗會自動鎖定」與底下的停用提示會直接互相矛盾，
          而使用者只會讀到其中一句。關閉時改成中性的說明，狀態交給 banner 講
        */}
        <p className="text-muted-foreground text-sm">
          {lockDisabled
            ? '列出目前有鎖定紀錄的後台帳號。'
            : '連續登入失敗達門檻時自動鎖定；時效到期會自動解開，也可以在這裡提前解鎖'}
        </p>
      </div>

      {lockDisabled && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">帳號鎖定功能目前停用</p>
            <p>
              系統不會因為連續登入失敗而鎖定帳號，因此這份清單會是空的。
              要啟用請設定環境變數{' '}
              <code>APPLICATION_ACCOUNT_LOCK_ENABLED=true</code>。
            </p>
          </div>
        </div>
      )}

      <AccountLocksSearchBar
        initialSearch={url.search ?? ''}
        status={url.status}
        onSearch={url.setSearch}
        onStatusChange={url.setStatus}
      />

      <AccountLocksTable
        data={rows}
        isLoading={listQuery.isLoading}
        onUnlock={handleUnlock}
      />

      <DataTablePagination
        page={meta?.page ?? 1}
        limit={meta?.limit ?? 10}
        total={meta?.total ?? 0}
        onPageChange={url.setPage}
        onLimitChange={url.setLimit}
      />

      <DeleteConfirmDialog
        open={unlockTarget !== null}
        title="解鎖這個帳號？"
        description={`${unlockTarget?.email ?? ''} 將可以立即再次嘗試登入，失敗計數歸零。`}
        confirmLabel="解鎖"
        isDeleting={unlock.isPending}
        pendingLabel="解鎖中…"
        onCancel={() => setUnlockTarget(null)}
        onConfirm={() =>
          unlock.mutate({ body: { email: unlockTarget?.email ?? '' } })
        }
      />
    </div>
  );
};
