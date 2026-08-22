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
import type { AdminRoomRow } from '../hooks/use-rooms-query';
import {
  MESSAGE_COUNT_HINT,
  roomLabel,
  roomTypeLabel,
} from '../lib/moderation-display';

type RoomsTableProps = {
  data: AdminRoomRow[];
  isLoading?: boolean;
  onView: (room: AdminRoomRow) => void;
};

/**
 * 聊天室列表
 *
 * **不顯示任何訊息內容**——總覽回答的是「這個房間發生了什麼」，
 * 不是「他們說了什麼」。後端本來就不回，前端也不從其他來源補。
 */
export const RoomsTable = ({ data, isLoading, onView }: RoomsTableProps) => {
  const columns = useMemo<ColumnDef<AdminRoomRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '名稱',
        cell: ({ row }) => (
          <span className="font-medium">{roomLabel(row.original.name)}</span>
        ),
      },
      {
        accessorKey: 'roomType',
        header: '類型',
        cell: ({ row }) => roomTypeLabel(row.original.roomType),
      },
      {
        accessorKey: 'memberCount',
        header: '成員數',
        cell: ({ row }) => row.original.memberCount,
      },
      {
        accessorKey: 'messageCount',
        // 標題就帶說明：不標的話「訊息量」會被讀成「現在有幾則」，
        // 而在有人撤回過訊息之後那兩個數字就不一樣了
        header: () => (
          <span className="inline-flex items-center gap-1">
            訊息量
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="text-muted-foreground size-3" />
              </TooltipTrigger>
              <TooltipContent>{MESSAGE_COUNT_HINT}</TooltipContent>
            </Tooltip>
          </span>
        ),
        cell: ({ row }) => row.original.messageCount,
      },
      {
        accessorKey: 'createdAt',
        header: '建立時間',
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
          <Button variant="ghost" size="sm" onClick={() => onView(row.original)}>
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
      emptyMessage="目前沒有符合條件的聊天室"
    />
  );
};
