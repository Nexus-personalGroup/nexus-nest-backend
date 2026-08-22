import { Link } from 'react-router-dom';

import type { paths } from '@app/api-client';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatRelativeTime } from '@/lib/format-relative-time';
import { roomLabel } from '../lib/moderation-display';

type RoomsData = NonNullable<
  paths['/moderation/members/{memberId}/rooms']['get']['responses'][200]['content']['application/json']['data']
>;

type RoomRow = RoomsData['list'][number];

type MemberRoomsPanelProps = {
  rooms: RoomRow[];
  isLoading: boolean;
};

/**
 * 成員所在的聊天室清單
 *
 * 房間名稱為 null 代表私聊——顯示固定字樣而非空白，
 * 否則那一列看起來像資料壞掉。
 *

 * 每一列連往該房間的詳情頁——動線的價值在完整，少了這一條，
 * 審閱者看到「他在 5 個聊天室」之後就卡住了。
 *
 * 時間顯示的是**房間建立時間**而非該成員的加入時間：
 * 這支查詢與前台的「我的房間」是同一支，而它不回 `joinedAt`。
 * 為了這一個欄位改共用的回應形狀，代價會落到前台身上。
 */
export const MemberRoomsPanel = ({
  rooms,
  isLoading,
}: MemberRoomsPanelProps) => {
  if (isLoading) return <Skeleton className="h-20 w-full" />;

  if (rooms.length === 0) {
    return <p className="text-muted-foreground text-sm">不在任何聊天室</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {rooms.map((room) => (
        <li
          key={room.id}
          className="border-border flex items-baseline justify-between gap-2 border-b pb-2 text-sm last:border-0"
        >
          <Link
            to={`/moderation/rooms/${room.id}`}
            className="font-medium underline underline-offset-4"
          >
            {roomLabel(room.name)}
          </Link>
          <span className="text-muted-foreground flex items-center gap-3 text-xs">
            <span>{room.memberCount} 人</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{formatRelativeTime(room.createdAt)}</span>
              </TooltipTrigger>
              <TooltipContent>{room.createdAt}</TooltipContent>
            </Tooltip>
          </span>
        </li>
      ))}
    </ol>
  );
};

export type { RoomRow };
