import { Link, Navigate } from 'react-router-dom';
import { AlertTriangle, Info } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format-relative-time';
import { useHasPermission } from '@/lib/use-has-permission';
import { useDashboardStream } from '../hooks/use-dashboard-stream';

const PERM_VIEW = 'BACKEND:MODERATION:VIEW';

type StatProps = {
  label: string;
  value: number;
  /** 串流中斷時數字要看得出來是舊的 */
  stale: boolean;
  hint?: string;
  to?: string;
};

const Stat = ({ label, value, stale, hint, to }: StatProps) => {
  const number = (
    <span
      className={cn(
        'text-3xl font-semibold',
        stale && 'text-muted-foreground line-through decoration-1',
      )}
    >
      {value}
    </span>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground inline-flex items-center gap-1 text-sm font-normal">
          {label}
          {hint ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3" />
              </TooltipTrigger>
              <TooltipContent>{hint}</TooltipContent>
            </Tooltip>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {to ? (
          <Link to={to} className="underline underline-offset-4">
            {number}
          </Link>
        ) : (
          number
        )}
      </CardContent>
    </Card>
  );
};

/**
 * 營運總覽。
 *
 * **中斷時數字要看得出來是舊的**——這是這個頁面最重要的規則。
 * 一個安靜地顯示 20 分鐘前數字的儀表板比沒有儀表板更糟：
 * 它讓人以為自己知道現況，而營運會依它做判斷。
 */
export const DashboardPage = () => {
  const canView = useHasPermission(PERM_VIEW);
  const { snapshot, connected } = useDashboardStream(canView);

  if (!canView) return <Navigate to="/" replace />;

  if (!snapshot) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="營運總覽" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const stale = !connected;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="營運總覽"
        description={`最後更新於 ${formatRelativeTime(snapshot.generatedAt)}`}
      >
        {stale ? (
          <span className="text-destructive inline-flex items-center gap-1 text-sm font-medium">
            <AlertTriangle className="size-4" />
            連線中斷，重新連線中——以下為過期的數字
          </span>
        ) : null}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="線上人數" value={snapshot.onlineMembers} stale={stale} />
        {/* 五個數字裡只有它是要人採取行動的 */}
        <Stat
          label="待處理檢舉"
          value={snapshot.pendingReports}
          stale={stale}
          to="/moderation/reports"
        />
        <Stat
          label="今日訊息數"
          value={snapshot.messagesToday}
          stale={stale}
          hint="日界依系統時區（APP_TIMEZONE）而非 UTC"
        />
        <Stat label="聊天室" value={snapshot.totalRooms} stale={stale} />
        <Stat label="成員" value={snapshot.totalMembers} stale={stale} />
      </div>
    </div>
  );
};
