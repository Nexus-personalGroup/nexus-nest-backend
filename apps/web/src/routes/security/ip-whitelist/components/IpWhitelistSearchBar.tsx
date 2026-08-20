import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useIsFirstRun } from '@/lib/use-is-first-run';

type IpWhitelistSearchBarProps = {
  initialSearch: string;
  onSearch: (search: string) => void;
};

/**
 * IP 搜尋（debounce 300ms）+ 重置按鈕
 */
export const IpWhitelistSearchBar = ({
  initialSearch,
  onSearch,
}: IpWhitelistSearchBarProps) => {
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
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-ip" className="text-xs">
          搜尋 IP
        </Label>
        <Input
          id="search-ip"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="輸入 IP（部分比對）"
          className="w-56"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={handleReset}
        disabled={input === ''}
        title="重置搜尋條件"
      >
        <RotateCcw />
        重置
      </Button>
    </div>
  );
};
