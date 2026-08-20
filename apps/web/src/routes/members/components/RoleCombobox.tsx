import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import type { paths } from '@app/api-client';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useInfiniteScrollSentinel } from '@/lib/use-infinite-scroll-sentinel';
import { useRoleOptionsInfiniteQuery } from '../hooks/use-role-options-infinite-query';
import { useRoleOptionFallbackQuery } from '../hooks/use-role-option-fallback-query';

// 從 generated schema 推導；raw 三欄都是 optional（後端 contract）
type RoleOptionRaw = NonNullable<
  paths['/members/role/options/{id}']['get']['responses'][200]['content']['application/json']['data']
>;

// Combobox 渲染需要的 narrowed 形狀
type RoleOption = {
  id: string;
  name: string;
  isAssignable: boolean;
};

type RoleComboboxProps = {
  /** 表單目前選的 roleId（uuid 字串；空字串表示未選） */
  value: string;
  onChange: (next: string) => void;
  /** 編輯模式時帶入既有 roleId，做 fallback fetch */
  editingRoleId?: string;
  /** 表單 disabled 時整個 trigger disabled */
  disabled?: boolean;
};

/**
 * 把 generated schema 的 optional 欄位 narrow 成 Combobox 需要的 non-null 形狀；
 * 任一必要欄位缺失就回 null，呼叫端用 filter 排除
 */
const toRoleOption = (raw: RoleOptionRaw | undefined): RoleOption | null => {
  if (!raw?.id || raw.name === undefined || raw.isAssignable === undefined) {
    return null;
  }
  return { id: raw.id, name: raw.name, isAssignable: raw.isAssignable };
};

/**
 * 依 id 去重，保留陣列中第一次出現的順序（fallback 在前、分頁資料在後）
 */
const dedupeById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
};

/**
 * 會員 dialog 的角色選擇 Combobox：cmdk + popover + useInfiniteQuery + IntersectionObserver
 *
 * 互動規格：
 * - 點 trigger 開啟 popover，內含搜尋輸入與可滾動清單
 * - 搜尋輸入 debounce 300ms 後寫入 queryKey 重抓
 * - 清單底端的 sentinel 進入視窗時自動 fetchNextPage（由 useInfiniteScrollSentinel 收斂）
 * - isAssignable === false 的選項顯示但 disabled，標示「（預設）」（與角色列表 badge 一致）
 *   後端 isAssignable=false 推導規則：目前 roleCode === 'SUPERADMIN' 才 disabled
 * - 編輯模式若 value 不在第一頁，並列 fetch fallback option，合併進清單頂端
 */
export const RoleCombobox = ({
  value,
  onChange,
  editingRoleId,
  disabled,
}: RoleComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const listQuery = useRoleOptionsInfiniteQuery(debouncedSearch);
  const fallbackQuery = useRoleOptionFallbackQuery(editingRoleId);

  // 合併分頁與 fallback：fallback 放頂端、依 id 去重、過濾欄位缺失的 row
  const options: RoleOption[] = useMemo(() => {
    const fallback = toRoleOption(fallbackQuery.data);
    const pages = listQuery.data?.pages ?? [];
    const fromPages = pages
      .flatMap((page) => page?.list ?? [])
      .map(toRoleOption);
    return dedupeById(
      [fallback, ...fromPages].filter((opt): opt is RoleOption => opt !== null),
    );
  }, [listQuery.data, fallbackQuery.data]);

  // 顯示「目前選中角色」名稱：先用 options 內找，找不到看 fallback 失敗 → 顯示 placeholder
  const selectedLabel = useMemo(() => {
    if (!value) return '';
    const found = options.find((opt) => opt.id === value);
    if (found) return found.name;
    // value 存在但找不到對應角色（fallback 404 / 角色已停用）
    if (fallbackQuery.isError) return '（已停用 / 不可用）';
    return '';
  }, [value, options, fallbackQuery.isError]);

  // sentinel + IntersectionObserver：在清單底端觸發 fetchNextPage；popover 關閉時 disable
  const sentinelRef = useInfiniteScrollSentinel(listQuery, open);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          {selectedLabel || '請選擇角色'}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="搜尋角色名稱"
            value={searchInput}
            onValueChange={setSearchInput}
          />
          <CommandList>
            {listQuery.isLoading && options.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : options.length === 0 ? (
              <CommandEmpty>找不到角色</CommandEmpty>
            ) : (
              <>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={opt.id}
                    disabled={!opt.isAssignable}
                    onSelect={() => {
                      if (!opt.isAssignable) return;
                      onChange(opt.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 size-4',
                        value === opt.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span>{opt.name}</span>
                    {!opt.isAssignable ? (
                      <span className="text-muted-foreground ml-2 text-xs">
                        （預設）
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
                <div ref={sentinelRef} className="h-px" />
                {listQuery.isFetchingNextPage ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
