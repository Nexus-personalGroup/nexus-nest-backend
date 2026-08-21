import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReportStatus } from '../lib/moderation-display';

type ReportStatusFilterProps = {
  value: ReportStatus;
  onChange: (next: ReportStatus) => void;
};

const OPTIONS: { value: ReportStatus; label: string }[] = [
  { value: 'PENDING', label: '待處理' },
  { value: 'REVIEWED', label: '已處理' },
  { value: 'DISMISSED', label: '已駁回' },
];

/**
 * 檢舉狀態篩選
 *
 * 沒有「全部」選項：後端的 `status` 是必選其一（未指定即待處理），
 * 給一個做不到的選項只會製造必然落空的操作。
 */
export const ReportStatusFilter = ({
  value,
  onChange,
}: ReportStatusFilterProps) => (
  <Select
    value={value}
    onValueChange={(next) => onChange(next as ReportStatus)}
  >
    <SelectTrigger className="w-40">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {OPTIONS.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
