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

export type MemberRow = {
  id?: string;
  email?: string;
  member?: string;
  roleId?: string;
  roleName?: string;
  status?: boolean;
  isDefault?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type MembersTableProps = {
  data: MemberRow[];
  isLoading?: boolean;
  /** 當前登入者的 sub，用於 disable 自己這列的 status Switch */
  currentSub: string | undefined;
  /** 是否有 BACKEND:ACCOUNT:EDIT 權限 */
  canEdit: boolean;
  onView: (member: MemberRow) => void;
  onEdit: (member: MemberRow) => void;
  onDelete: (member: MemberRow) => void;
  onToggleStatus: (member: MemberRow, nextStatus: boolean) => void;
};

export const MembersTable = ({
  data,
  isLoading,
  currentSub,
  canEdit,
  onView,
  onEdit,
  onDelete,
  onToggleStatus,
}: MembersTableProps) => {
  // memo columns：父層 callbacks 已用 useCallback 穩定，這層只在權限 / 自身 id 變動時重算
  const columns = useMemo<ColumnDef<MemberRow>[]>(
    () => [
      {
        accessorKey: 'member',
        header: '名稱',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.member ?? '—'}</span>
            {row.original.isDefault ? (
              <span className="bg-muted text-muted-foreground inline-flex h-5 items-center rounded-full px-2 text-xs">
                預設
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            {row.original.email ?? '—'}
          </div>
        ),
      },
      {
        accessorKey: 'roleName',
        header: '角色',
        cell: ({ row }) => row.original.roleName ?? '—',
      },
      {
        accessorKey: 'status',
        header: '狀態',
        cell: ({ row }) => {
          const isSelf = row.original.id === currentSub;
          const isDefault = row.original.isDefault === true;
          const disabled = !canEdit || isSelf || isDefault;
          // 優先序：權限 > 預設帳號 > 自己（更具體先講）
          const reason = !canEdit
            ? '無編輯權限'
            : isDefault
              ? '預設帳號不可變更狀態'
              : isSelf
                ? '不能停用自己的帳號'
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
        accessorKey: 'lastLoginAt',
        header: '最後登入',
        cell: ({ row }) => {
          const value = row.original.lastLoginAt;
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
          const isSelf = row.original.id === currentSub;
          const isDefault = row.original.isDefault === true;
          const editReason = isDefault ? '預設帳號不可編輯' : '';
          const deleteReason = isDefault
            ? '預設帳號不可刪除'
            : isSelf
              ? '不能刪除自己的帳號'
              : '';
          const deleteDisabled = isDefault || isSelf;

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
    [currentSub, canEdit, onView, onEdit, onDelete, onToggleStatus],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="目前沒有會員"
    />
  );
};
