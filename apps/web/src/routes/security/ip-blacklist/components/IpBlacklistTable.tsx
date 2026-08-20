import { useMemo } from 'react';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable } from '@/components/data-table/DataTable';
import { formatRelativeTime } from '@/lib/format-relative-time';

export type IpBlacklistRow = {
  id?: string;
  ipAddress?: string;
  reason?: string | null;
  isAutoBlock?: boolean;
  createdBy?: string | null;
  createdAt?: string;
};

type IpBlacklistTableProps = {
  data: IpBlacklistRow[];
  isLoading?: boolean;
  onView: (row: IpBlacklistRow) => void;
  onEdit: (row: IpBlacklistRow) => void;
  onDelete: (row: IpBlacklistRow) => void;
};

export const IpBlacklistTable = ({
  data,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: IpBlacklistTableProps) => {
  const columns = useMemo<ColumnDef<IpBlacklistRow>[]>(
    () => [
      {
        accessorKey: 'ipAddress',
        header: 'IP',
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {row.original.ipAddress ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'reason',
        header: '原因',
        cell: ({ row }) => row.original.reason ?? '—',
      },
      {
        accessorKey: 'isAutoBlock',
        header: '來源',
        cell: ({ row }) => (
          <span
            className={
              row.original.isAutoBlock
                ? 'bg-destructive/10 text-destructive inline-flex h-5 items-center rounded-full px-2 text-xs'
                : 'bg-muted text-muted-foreground inline-flex h-5 items-center rounded-full px-2 text-xs'
            }
          >
            {row.original.isAutoBlock ? '自動' : '手動'}
          </span>
        ),
      },
      {
        accessorKey: 'createdBy',
        header: '建立者',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {row.original.createdBy ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: '建立時間',
        cell: ({ row }) => {
          const v = row.original.createdAt;
          if (!v) return <span className="text-muted-foreground">—</span>;
          return (
            <span title={new Date(v).toISOString()}>
              {formatRelativeTime(v)}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: () => <div className="text-right">操作</div>,
        cell: ({ row }) => (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onView(row.original)}>
                  <Eye />
                  檢視
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onEdit(row.original)}>
                  <Pencil />
                  編輯
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onDelete(row.original)}
                >
                  <Trash2 />
                  刪除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [onView, onEdit, onDelete],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="目前沒有 IP 黑名單"
    />
  );
};
