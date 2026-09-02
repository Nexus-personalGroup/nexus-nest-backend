import { useMemo } from 'react';
import { LockOpen } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table/DataTable';
import { DisabledHint } from '@/components/DisabledHint';
import { formatRelativeTime } from '@/lib/format-relative-time';
import { cn } from '@/lib/utils';

export type AccountLockRow = {
  id?: string;
  email?: string;
  member?: string;
  lockedAt?: string;
  unlocksAt?: string;
  failedLoginCount?: number;
  status?: string;
};

type AccountLocksTableProps = {
  data: AccountLockRow[];
  isLoading?: boolean;
  onUnlock: (row: AccountLockRow) => void;
};

const EXPIRED_HINT = '已自動解鎖，不需要再解一次';

export const AccountLocksTable = ({
  data,
  isLoading,
  onUnlock,
}: AccountLocksTableProps) => {
  const columns = useMemo<ColumnDef<AccountLockRow>[]>(
    () => [
      { accessorKey: 'email', header: 'Email' },
      { accessorKey: 'member', header: '名稱' },
      {
        accessorKey: 'status',
        header: '狀態',
        // 只給時間會逼使用者自己心算「過了沒」，而那正是這一頁要回答的問題
        cell: ({ row }) => {
          const locked = row.original.status === 'locked';
          return (
            <span
              className={cn(
                'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium',
                locked
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {locked ? '鎖定中' : '已到期'}
            </span>
          );
        },
      },
      {
        accessorKey: 'lockedAt',
        header: '鎖定時間',
        cell: ({ row }) =>
          row.original.lockedAt
            ? formatRelativeTime(row.original.lockedAt)
            : '—',
      },
      {
        accessorKey: 'unlocksAt',
        header: '自動解鎖',
        // 管理員要判斷的是「還要等多久」，絕對時間留在 title 供需要時對照
        cell: ({ row }) =>
          row.original.unlocksAt ? (
            <span title={row.original.unlocksAt}>
              {formatRelativeTime(row.original.unlocksAt)}
            </span>
          ) : (
            '—'
          ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => {
          // 後端對非鎖定中的帳號回 409，提供一個按下去必定失敗的按鈕比沒有按鈕更糟。
          // **用 disabled 而不是隱藏**：這是資料狀態不是權限——
          // 使用者需要知道「這個人已經可以登入了」，而不是以為功能不見了
          const expired = row.original.status !== 'locked';
          return (
            <DisabledHint reason={expired ? EXPIRED_HINT : ''} side="left">
              <Button
                variant="outline"
                size="sm"
                disabled={expired}
                onClick={() => onUnlock(row.original)}
              >
                <LockOpen className="size-4" />
                解鎖
              </Button>
            </DisabledHint>
          );
        },
      },
    ],
    [onUnlock],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="目前沒有帳號被鎖定"
    />
  );
};
