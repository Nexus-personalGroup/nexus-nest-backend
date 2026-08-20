import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StatusFilter } from '@/lib/status-filter';

/**
 * 列表頁狀態篩選下拉。三選一：全部 / 啟用 / 停用。
 *
 * 對外接 StatusFilter（'true' / 'false' / undefined）；內部用 sentinel `'all'`
 * 滿足 shadcn `Select` value 不能 undefined 的限制，呼叫端不必知道這層細節
 */
const ALL_SENTINEL = 'all' as const;
type InternalValue = StatusFilter | typeof ALL_SENTINEL;

type StatusFilterSelectProps = {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  /** 預設「狀態」；列表頁可改成「會員狀態」「角色狀態」等 */
  label?: string;
};

export const StatusFilterSelect = ({
  value,
  onChange,
  label = '狀態',
}: StatusFilterSelectProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs" htmlFor="status-filter">
        {label}
      </label>
      <Select
        value={value ?? ALL_SENTINEL}
        onValueChange={(v) => {
          const next = v as InternalValue;
          onChange(next === ALL_SENTINEL ? undefined : next);
        }}
      >
        <SelectTrigger id="status-filter" className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SENTINEL}>全部</SelectItem>
          <SelectItem value="true">啟用</SelectItem>
          <SelectItem value="false">停用</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
