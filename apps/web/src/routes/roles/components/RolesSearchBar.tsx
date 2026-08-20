import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusFilterSelect } from '@/components/StatusFilterSelect';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useIsFirstRun } from '@/lib/use-is-first-run';
import type { StatusFilter } from '@/lib/status-filter';

type RolesSearchBarProps = {
  initialName: string;
  initialStatus: StatusFilter;
  onSearch: (name: string) => void;
  onStatusChange: (status: StatusFilter) => void;
};

/**
 * 角色搜尋：name debounce 300ms + 狀態下拉（即時觸發）
 */
export const RolesSearchBar = ({
  initialName,
  initialStatus,
  onSearch,
  onStatusChange,
}: RolesSearchBarProps) => {
  const [nameInput, setNameInput] = useState(initialName);
  const debouncedName = useDebouncedValue(nameInput, 300);

  // mount 首次的 debounced 值等於 initialName（即 URL 現況），跳過
  const consumeFirstRun = useIsFirstRun();
  useEffect(() => {
    if (consumeFirstRun()) return;
    onSearch(debouncedName);
  }, [debouncedName, onSearch, consumeFirstRun]);

  const hasFilter = nameInput !== '' || initialStatus !== undefined;

  const handleReset = () => {
    setNameInput('');
    onSearch('');
    onStatusChange(undefined);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-role-name" className="text-xs">
          搜尋名稱
        </Label>
        <Input
          id="search-role-name"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="輸入角色名稱"
          className="w-56"
        />
      </div>
      <StatusFilterSelect value={initialStatus} onChange={onStatusChange} />
      <Button
        type="button"
        variant="outline"
        onClick={handleReset}
        disabled={!hasFilter}
        title="重置搜尋條件"
      >
        <RotateCcw />
        重置
      </Button>
    </div>
  );
};
