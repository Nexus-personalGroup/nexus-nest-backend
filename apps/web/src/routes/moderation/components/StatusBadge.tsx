import { cn } from '@/lib/utils';
import { statusBadgeClass, statusLabel } from '../lib/moderation-display';

type StatusBadgeProps = {
  status: string;
};

/**
 * 檢舉狀態徽章
 *
 * 用 span 而非 shadcn 的 badge 元件：專案目前沒有裝 badge，
 * 而會員列表的「預設」標記已經是同一種寫法——為了一個標籤引入新元件不划算。
 */
export const StatusBadge = ({ status }: StatusBadgeProps) => (
  <span
    className={cn(
      'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium',
      statusBadgeClass(status),
    )}
  >
    {statusLabel(status)}
  </span>
);
