import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatRelativeTime } from '@/lib/format-relative-time';
import type { MemberReportRow } from '../hooks/use-member-profile-query';
import {
  counterpartHeader,
  participantLabel,
  reasonLabel,
  type MemberReportRole,
} from '../lib/moderation-display';
import { StatusBadge } from './StatusBadge';

type MemberReportsPanelProps = {
  rows: MemberReportRow[];
  isLoading: boolean;
  role: MemberReportRole;
  page: number;
  totalPages: number;
  onRoleChange: (next: MemberReportRole) => void;
  onPageChange: (page: number) => void;
};

const ROLES: { value: MemberReportRole; label: string }[] = [
  { value: 'TARGET', label: '被檢舉' },
  { value: 'REPORTER', label: '提出的' },
];

/**
 * 相關檢舉列表
 *
 * 每一列顯示**對造**而非這個人自己——顯示自己等於每一列都印同一個 email。
 *
 * 點進去才會寫 `REPORT_VIEWED` 稽核，因此這裡**不做任何 prefetch**：
 * hover 預載會製造一堆沒有人真的看過的紀錄。
 *
 * 資料由呼叫端提供而非自己查——與 `MemberRoomsPanel` 一致，
 * 讓這一層是純展示、測起來不需要架 QueryClient。
 */
export const MemberReportsPanel = ({
  rows,
  isLoading,
  role,
  page,
  totalPages,
  onRoleChange,
  onPageChange,
}: MemberReportsPanelProps) => {

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {ROLES.map((option) => (
          <Button
            key={option.value}
            variant={role === option.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => onRoleChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {role === 'TARGET' ? '沒有被檢舉的紀錄' : '沒有提出過檢舉'}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.reportId}>
              <Link
                to={`/moderation/reports/${row.reportId}`}
                className="hover:bg-muted flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <span className="flex flex-col">
                  <span className="text-muted-foreground text-xs">
                    {counterpartHeader(role)}
                  </span>
                  <span className="font-medium">
                    {participantLabel(row.counterpartEmail, row.counterpartId)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span>{reasonLabel(row.reason)}</span>
                  <StatusBadge status={row.status} />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground text-xs">
                        {formatRelativeTime(row.createdAt)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{row.createdAt}</TooltipContent>
                  </Tooltip>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

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
