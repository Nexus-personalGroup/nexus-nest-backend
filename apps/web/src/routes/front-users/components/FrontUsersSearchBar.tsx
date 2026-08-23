import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusFilterSelect } from '@/components/StatusFilterSelect';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useIsFirstRun } from '@/lib/use-is-first-run';
import type { StatusFilter } from '@/lib/status-filter';

type FrontUsersSearchBarProps = {
  initialEmail: string;
  initialDisplayName: string;
  initialStatus: StatusFilter;
  initialVerified: StatusFilter;
  onSearch: (email: string, displayName: string) => void;
  onStatusChange: (status: StatusFilter) => void;
  onVerifiedChange: (verified: StatusFilter) => void;
};

/**
 * email + 顯示名稱 debounce 300ms，兩個下拉即時觸發。
 *
 * 兩個下拉共用 `StatusFilterSelect`，但**必須各自給 id**——
 * 重複的 DOM id 會讓 label 指到錯的那一個，而畫面上完全看不出來。
 */
export const FrontUsersSearchBar = ({
  initialEmail,
  initialDisplayName,
  initialStatus,
  initialVerified,
  onSearch,
  onStatusChange,
  onVerifiedChange,
}: FrontUsersSearchBarProps) => {
  const [emailInput, setEmailInput] = useState(initialEmail);
  const [nameInput, setNameInput] = useState(initialDisplayName);

  const debouncedEmail = useDebouncedValue(emailInput, 300);
  const debouncedName = useDebouncedValue(nameInput, 300);

  // mount 首次的 debounced 值等於 URL 現況，跳過避免多走一次 setSearchParams
  const consumeFirstRun = useIsFirstRun();
  useEffect(() => {
    if (consumeFirstRun()) return;
    onSearch(debouncedEmail, debouncedName);
  }, [debouncedEmail, debouncedName, onSearch, consumeFirstRun]);

  const hasFilter =
    emailInput !== '' ||
    nameInput !== '' ||
    initialStatus !== undefined ||
    initialVerified !== undefined;

  const handleReset = () => {
    setEmailInput('');
    setNameInput('');
    // 立即寫 URL，不等 debounce
    onSearch('', '');
    onStatusChange(undefined);
    onVerifiedChange(undefined);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-front-email" className="text-xs">
          搜尋 Email
        </Label>
        <Input
          id="search-front-email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="輸入 Email"
          className="w-56"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-front-name" className="text-xs">
          搜尋顯示名稱
        </Label>
        <Input
          id="search-front-name"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="輸入顯示名稱"
          className="w-48"
        />
      </div>
      <StatusFilterSelect
        id="front-user-status-filter"
        label="帳號狀態"
        value={initialStatus}
        onChange={onStatusChange}
      />
      <StatusFilterSelect
        id="front-user-verified-filter"
        label="信箱驗證"
        trueLabel="已驗證"
        falseLabel="未驗證"
        value={initialVerified}
        onChange={onVerifiedChange}
      />
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
