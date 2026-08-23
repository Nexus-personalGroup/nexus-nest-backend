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
  /**
   * DOM id。**同一頁放兩個這種下拉時必須各自指定**——
   * 重複的 id 會讓 label 指到錯的那一個，而畫面上完全看不出來
   */
  id?: string;
  /** 兩個選項的文字；預設「啟用 / 停用」。用於狀態以外的布林過濾 */
  trueLabel?: string;
  falseLabel?: string;
};

export const StatusFilterSelect = ({
  value,
  onChange,
  label = '狀態',
  id = 'status-filter',
  trueLabel = '啟用',
  falseLabel = '停用',
}: StatusFilterSelectProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs" htmlFor={id}>
        {label}
      </label>
      <Select
        value={value ?? ALL_SENTINEL}
        onValueChange={(v) => {
          const next = v as InternalValue;
          onChange(next === ALL_SENTINEL ? undefined : next);
        }}
      >
        <SelectTrigger id={id} className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SENTINEL}>全部</SelectItem>
          <SelectItem value="true">{trueLabel}</SelectItem>
          <SelectItem value="false">{falseLabel}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
