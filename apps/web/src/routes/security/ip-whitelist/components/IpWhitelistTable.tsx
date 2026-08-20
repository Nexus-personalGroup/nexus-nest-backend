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

export type IpWhitelistRow = {
  id?: string;
  ipAddress?: string;
  description?: string | null;
  createdBy?: string | null;
  createdAt?: string;
};

type IpWhitelistTableProps = {
  data: IpWhitelistRow[];
  isLoading?: boolean;
  onView: (row: IpWhitelistRow) => void;
  onEdit: (row: IpWhitelistRow) => void;
  onDelete: (row: IpWhitelistRow) => void;
};

export const IpWhitelistTable = ({
  data,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: IpWhitelistTableProps) => {
  const columns = useMemo<ColumnDef<IpWhitelistRow>[]>(
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
        accessorKey: 'description',
        header: '備註',
        cell: ({ row }) => row.original.description ?? '—',
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
      emptyMessage="目前沒有 IP 白名單"
    />
  );
};
