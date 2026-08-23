import { useMemo } from 'react';
import { Eye, Info } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DataTable } from '@/components/data-table/DataTable';
import { formatRelativeTime } from '@/lib/format-relative-time';
import { cn } from '@/lib/utils';
import type { FrontUserRow } from '../hooks/use-front-users-query';
import {
  LAST_SEEN_HINT,
  avatarFallback,
  statusBadgeClass,
  statusLabel,
  verifiedLabel,
} from '../lib/front-user-display';

type FrontUsersTableProps = {
  data: FrontUserRow[];
  isLoading?: boolean;
  onView: (user: FrontUserRow) => void;
};

/** 頭像；沒有 avatarUrl 時退回顯示名稱首字，版面不變 */
const Avatar = ({ user }: { user: FrontUserRow }) =>
  user.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt=""
      className="size-7 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium">
      {avatarFallback(user.displayName)}
    </span>
  );

/**
 * 前台會員列表。
 *
 * 這裡的「會員」是**前台使用者**（`users`），與 `/members` 的後台帳號
 * 是兩個不相交的身分空間。
 */
export const FrontUsersTable = ({
  data,
  isLoading,
  onView,
}: FrontUsersTableProps) => {
  const columns = useMemo<ColumnDef<FrontUserRow>[]>(
    () => [
      {
        accessorKey: 'displayName',
        header: '會員',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Avatar user={row.original} />
            <span className="font-medium">{row.original.displayName}</span>
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => row.original.email,
      },
      {
        accessorKey: 'status',
        header: '狀態',
        cell: ({ row }) => (
          <span
            className={cn(
              'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium',
              statusBadgeClass(row.original.status),
            )}
          >
            {statusLabel(row.original.status)}
          </span>
        ),
      },
      {
        accessorKey: 'emailVerifiedAt',
        header: '信箱',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {verifiedLabel(row.original.emailVerifiedAt)}
          </span>
        ),
      },
      {
        accessorKey: 'lastSeenAt',
        // 標題就帶說明：不標的話「最後活動」會被讀成「最後上線」，
        // 而一個天天在聊天但很久沒重新登入的人會被誤判為不活躍
        header: () => (
          <span className="inline-flex items-center gap-1">
            最後登入
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="text-muted-foreground size-3" />
              </TooltipTrigger>
              <TooltipContent>{LAST_SEEN_HINT}</TooltipContent>
            </Tooltip>
          </span>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatRelativeTime(row.original.lastSeenAt, '從未登入')}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: '註冊時間',
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground">
                {formatRelativeTime(row.original.createdAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{row.original.createdAt}</TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onView(row.original)}
          >
            <Eye />
            檢視
          </Button>
        ),
      },
    ],
    [onView],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="目前沒有符合條件的前台會員"
    />
  );
};
