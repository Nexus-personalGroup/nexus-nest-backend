import type { ReactElement } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type DisabledHintProps = {
  /** 不為空字串時包 Tooltip，否則直接渲染 children */
  reason: string;
  /**
   * 被包裝的元素（通常是 disabled 的 button / DropdownMenuItem）。
   * 用 `<span className="block">` 包一層讓 Tooltip 能在 disabled 元素上觸發
   */
  children: ReactElement;
  /** Tooltip 顯示位置；預設 'left' 適用 DropdownMenu 內 */
  side?: 'top' | 'right' | 'bottom' | 'left';
};

/**
 * 在 DropdownMenuItem / Button 等 disabled 元素上顯示「為何不可點」的 tooltip 包裝。
 * 收斂 MembersTable / RolesTable 多處同形 wrap pattern
 */
export const DisabledHint = ({
  reason,
  children,
  side = 'left',
}: DisabledHintProps) => {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block">{children}</span>
      </TooltipTrigger>
      <TooltipContent side={side}>{reason}</TooltipContent>
    </Tooltip>
  );
};
