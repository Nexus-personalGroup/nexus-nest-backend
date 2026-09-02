import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useIsFirstRun } from '@/lib/use-is-first-run';
import type { AccountLockStatusFilter } from '../hooks/use-account-locks-query';

type AccountLocksSearchBarProps = {
  initialSearch: string;
  status: AccountLockStatusFilter | undefined;
  onSearch: (search: string) => void;
  onStatusChange: (status: AccountLockStatusFilter) => void;
};

/** email 搜尋（debounce 300ms）+ 狀態過濾 + 重置 */
export const AccountLocksSearchBar = ({
  initialSearch,
  status,
  onSearch,
  onStatusChange,
}: AccountLocksSearchBarProps) => {
  const [input, setInput] = useState(initialSearch);
  const debounced = useDebouncedValue(input, 300);

  const consumeFirstRun = useIsFirstRun();
  useEffect(() => {
    if (consumeFirstRun()) return;
    onSearch(debounced);
  }, [debounced, onSearch, consumeFirstRun]);

  const handleReset = () => {
    setInput('');
    onSearch('');
    onStatusChange('locked');
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-email" className="text-xs">
          搜尋 Email
        </Label>
        <Input
          id="search-email"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="輸入 Email（部分比對）"
          className="w-64"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">狀態</Label>
        {/* 未指定時顯示 locked：後端的預設就是它，下拉留白會讓人以為沒有過濾 */}
        <Select
          value={status ?? 'locked'}
          onValueChange={(v) => onStatusChange(v as AccountLockStatusFilter)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="locked">鎖定中</SelectItem>
            <SelectItem value="expired">已到期</SelectItem>
            <SelectItem value="all">全部</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" onClick={handleReset}>
        <RotateCcw className="size-4" />
        重置
      </Button>
    </div>
  );
};
