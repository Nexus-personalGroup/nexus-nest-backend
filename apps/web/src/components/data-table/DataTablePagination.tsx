import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type DataTablePaginationProps = {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  pageSizeOptions?: number[];
};

/**
 * 控制 page/limit 的分頁列。由呼叫端提供當前值與 setter，內部不持有 state
 */
export const DataTablePagination = ({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  pageSizeOptions = [10, 20, 50, 100],
}: DataTablePaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-4 text-sm">
      <div>
        共 <span className="text-foreground font-medium">{total}</span> 筆，第{' '}
        <span className="text-foreground font-medium">{page}</span> /{' '}
        <span className="text-foreground font-medium">{totalPages}</span> 頁
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span>每頁</span>
          <Select
            value={String(limit)}
            onValueChange={(v) => onLimitChange(Number(v))}
          >
            <SelectTrigger size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>筆</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
            上一頁
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
          >
            下一頁
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
};
