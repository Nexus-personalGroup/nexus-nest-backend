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
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DataTable } from '@/components/data-table/DataTable';
import { DisabledHint } from '@/components/DisabledHint';
import { formatRelativeTime } from '@/lib/format-relative-time';

export type RoleRow = {
  id?: string;
  name?: string;
  status?: boolean;
  isDefault?: boolean;
  memberCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

type RolesTableProps = {
  data: RoleRow[];
  isLoading?: boolean;
  /** 是否有 BACKEND:ROLE:EDIT 權限 */
  canEdit: boolean;
  onView: (role: RoleRow) => void;
  onEdit: (role: RoleRow) => void;
  onDelete: (role: RoleRow) => void;
  onToggleStatus: (role: RoleRow, nextStatus: boolean) => void;
};

export const RolesTable = ({
  data,
  isLoading,
  canEdit,
  onView,
  onEdit,
  onDelete,
  onToggleStatus,
}: RolesTableProps) => {
  const columns = useMemo<ColumnDef<RoleRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '名稱',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name ?? '—'}</span>
            {row.original.isDefault ? (
              <span className="bg-muted text-muted-foreground inline-flex h-5 items-center rounded-full px-2 text-xs">
                預設
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'memberCount',
        header: '使用人數',
        cell: ({ row }) => (
          <span className="text-sm">{row.original.memberCount ?? 0}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: '狀態',
        cell: ({ row }) => {
          const isDefault = row.original.isDefault === true;
          const disabled = !canEdit || isDefault;
          const reason = !canEdit
            ? '無編輯權限'
            : isDefault
              ? '預設角色不可變更狀態'
              : '';
          const switchNode = (
            <Switch
              checked={row.original.status ?? false}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onToggleStatus(row.original, checked)
              }
            />
          );
          if (!disabled) return switchNode;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">{switchNode}</span>
              </TooltipTrigger>
              <TooltipContent>{reason}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: '建立時間',
        cell: ({ row }) => {
          const value = row.original.createdAt;
          if (!value) return <span className="text-muted-foreground">—</span>;
          return (
            <span title={new Date(value).toISOString()}>
              {formatRelativeTime(value)}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: () => <div className="text-right">操作</div>,
        cell: ({ row }) => {
          // VIEW 權限既然能到頁面就一定能看 → 至少顯示「檢視」
          // EDIT 權限再加「編輯」「刪除」
          const isDefault = row.original.isDefault === true;
          const memberCount = row.original.memberCount ?? 0;
          const editReason = isDefault ? '預設角色不可編輯' : '';
          const deleteReason = isDefault
            ? '預設角色不可刪除'
            : memberCount > 0
              ? `角色有 ${memberCount} 位使用者，請先移除才能刪除`
              : '';
          const deleteDisabled = isDefault || memberCount > 0;

          return (
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
                  {canEdit && (
                    <>
                      <DisabledHint reason={editReason}>
                        <DropdownMenuItem
                          disabled={isDefault}
                          onSelect={() => onEdit(row.original)}
                        >
                          <Pencil />
                          編輯
                        </DropdownMenuItem>
                      </DisabledHint>
                      <DisabledHint reason={deleteReason}>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={deleteDisabled}
                          onSelect={() => onDelete(row.original)}
                        >
                          <Trash2 />
                          刪除
                        </DropdownMenuItem>
                      </DisabledHint>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canEdit, onView, onEdit, onDelete, onToggleStatus],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="目前沒有角色"
    />
  );
};
