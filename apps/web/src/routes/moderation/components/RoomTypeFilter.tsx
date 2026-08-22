import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RoomType } from '../lib/moderation-display';

type RoomTypeFilterProps = {
  value: RoomType | undefined;
  onChange: (next: RoomType | undefined) => void;
};

/** 「全部」在 Select 內需要一個非空的值——空字串會被 Radix 當成未選 */
const ALL = 'ALL';

export const RoomTypeFilter = ({ value, onChange }: RoomTypeFilterProps) => (
  <Select
    value={value ?? ALL}
    onValueChange={(next) =>
      onChange(next === ALL ? undefined : (next as RoomType))
    }
  >
    <SelectTrigger className="w-40">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={ALL}>全部</SelectItem>
      <SelectItem value="GROUP">群組</SelectItem>
      <SelectItem value="DIRECT">私聊</SelectItem>
    </SelectContent>
  </Select>
);
