import { useMemo } from 'react';
import { Eye } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DataTable } from '@/components/data-table/DataTable';
import { formatRelativeTime } from '@/lib/format-relative-time';
import type { ReportRow } from '../hooks/use-reports-query';
import { participantLabel, reasonLabel } from '../lib/moderation-display';
import { StatusBadge } from './StatusBadge';

type ReportsTableProps = {
  data: ReportRow[];
  isLoading?: boolean;
  onView: (report: ReportRow) => void;
};

/**
 * 檢舉佇列表格
 *
 * **不顯示任何訊息內容**：後端本來就不回 `contentSnapshot`（列表看不到敏感內容
 * 是「稽核量與實際看到次數對齊」的前提），前端也不從其他來源補。
 */
export const ReportsTable = ({
  data,
  isLoading,
  onView,
}: ReportsTableProps) => {
  const columns = useMemo<ColumnDef<ReportRow>[]>(
    () => [
      {
        accessorKey: 'reporterEmail',
        header: '檢舉人',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {participantLabel(
              row.original.reporterEmail,
              row.original.reporterId,
            )}
          </span>
        ),
      },
      {
        accessorKey: 'targetMemberEmail',
        header: '被檢舉人',
        cell: ({ row }) => (
          <span className="font-medium">
            {participantLabel(
              row.original.targetMemberEmail,
              row.original.targetMemberId,
            )}
          </span>
        ),
      },
      {
        accessorKey: 'reason',
        header: '原因',
        cell: ({ row }) => reasonLabel(row.original.reason),
      },
      {
        accessorKey: 'status',
        header: '狀態',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'createdAt',
        header: '檢舉時間',
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
      emptyMessage="目前沒有符合條件的檢舉"
    />
  );
};
