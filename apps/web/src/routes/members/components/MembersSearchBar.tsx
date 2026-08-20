import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusFilterSelect } from '@/components/StatusFilterSelect';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useIsFirstRun } from '@/lib/use-is-first-run';
import type { StatusFilter } from '@/lib/status-filter';

type MembersSearchBarProps = {
  initialName: string;
  initialEmail: string;
  initialStatus: StatusFilter;
  onSearch: (name: string, email: string) => void;
  onStatusChange: (status: StatusFilter) => void;
};

/**
 * name + email debounce 300ms + 狀態下拉（即時觸發）
 */
export const MembersSearchBar = ({
  initialName,
  initialEmail,
  initialStatus,
  onSearch,
  onStatusChange,
}: MembersSearchBarProps) => {
  const [nameInput, setNameInput] = useState(initialName);
  const [emailInput, setEmailInput] = useState(initialEmail);

  const debouncedName = useDebouncedValue(nameInput, 300);
  const debouncedEmail = useDebouncedValue(emailInput, 300);

  // mount 首次的 debounced 值等於 initialName/Email（即 URL 現況），跳過避免多走 setSearchParams
  const consumeFirstRun = useIsFirstRun();
  useEffect(() => {
    if (consumeFirstRun()) return;
    onSearch(debouncedName, debouncedEmail);
  }, [debouncedName, debouncedEmail, onSearch, consumeFirstRun]);

  const hasFilter =
    nameInput !== '' || emailInput !== '' || initialStatus !== undefined;

  const handleReset = () => {
    setNameInput('');
    setEmailInput('');
    // 立即寫 URL，不等 debounce；之後 useEffect 因 debounced 變空再 fire 一次無害
    onSearch('', '');
    onStatusChange(undefined);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-name" className="text-xs">
          搜尋名稱
        </Label>
        <Input
          id="search-name"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="輸入名稱"
          className="w-48"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-email" className="text-xs">
          搜尋 Email
        </Label>
        <Input
          id="search-email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="輸入 Email"
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
