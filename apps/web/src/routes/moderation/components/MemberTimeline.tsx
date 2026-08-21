import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatRelativeTime } from '@/lib/format-relative-time';
import { actionLabel } from '../lib/moderation-display';

type TimelineData = NonNullable<
  paths['/moderation/members/{memberId}/timeline']['get']['responses'][200]['content']['application/json']['data']
>;

type TimelineEntry = TimelineData['list'][number];

type MemberTimelineProps = {
  memberId: string | undefined;
  page: number;
  onPageChange: (page: number) => void;
};

const PAGE_SIZE = 15;

/**
 * 被檢舉者的行為時間軸
 *
 * **放在詳情頁內而非另開頁面**：判斷「初犯還是慣犯」是做判定的當下就要有的資訊，
 * 而需要跳頁去看的資訊在實務上等於沒有。
 *
 * 分頁而非無限捲動：審閱要的是最近的行為，不是把整個歷史讀完。
 *
 * 稽核紀錄本來就不含訊息內容，這裡也不從其他端點補——
 * 時間軸回答的是「這個人做過什麼」，不是「他說了什麼」。
 */
export const MemberTimeline = ({
  memberId,
  page,
  onPageChange,
}: MemberTimelineProps) => {
  const query = useApiQuery(
    'GET',
    '/moderation/members/{memberId}/timeline',
    {
      params: {
        path: { memberId: memberId ?? '' },
        query: { page, limit: PAGE_SIZE },
      },
    },
    { enabled: Boolean(memberId) },
  );

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    );
  }

  const list: TimelineEntry[] = query.data?.list ?? [];
  const meta = query.data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  if (list.length === 0) {
    return <p className="text-muted-foreground text-sm">無行為紀錄</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {list.map((entry, index) => (
          <li
            key={`${entry.createdAt}-${index}`}
            className="border-border flex items-baseline justify-between gap-2 border-b pb-2 text-sm last:border-0"
          >
            <span className="font-medium">{actionLabel(entry.action)}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground text-xs">
                  {formatRelativeTime(entry.createdAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{entry.createdAt}</TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ol>

      {totalPages > 1 ? (
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>
            第 {page} / {totalPages} 頁
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              上一頁
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              下一頁
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
