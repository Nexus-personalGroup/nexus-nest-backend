import { Link } from 'react-router-dom';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatRelativeTime } from '@/lib/format-relative-time';
import type { RoomMemberRow } from '../hooks/use-rooms-query';
import { participantLabel } from '../lib/moderation-display';

type RoomMembersPanelProps = {
  members: RoomMemberRow[];
};

/**
 * 房間的成員清單
 *
 * **每一位都可點進他的概覽頁**——動線的價值在完整：
 * 少了這一條，審閱者看到房間裡有誰之後就卡住了，得回頭重新搜尋。
 *
 * 帳號已刪除的成員仍然列出且仍可點（概覽頁會回 404 並說明），
 * 把他從清單裡拿掉會讓成員數與清單長度對不起來。
 */
export const RoomMembersPanel = ({ members }: RoomMembersPanelProps) => {
  if (members.length === 0) {
    return <p className="text-muted-foreground text-sm">這個房間沒有成員</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {members.map((member) => (
        <li
          key={member.memberId}
          className="border-border flex items-baseline justify-between gap-2 border-b pb-2 text-sm last:border-0"
        >
          <Link
            to={`/moderation/members/${member.memberId}`}
            className="font-medium underline underline-offset-4"
          >
            {participantLabel(member.email, member.memberId)}
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground text-xs">
                {formatRelativeTime(member.joinedAt)}加入
              </span>
            </TooltipTrigger>
            <TooltipContent>{member.joinedAt}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ol>
  );
};
