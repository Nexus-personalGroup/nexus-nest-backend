import { useMemo } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  groupPermissions,
  isViewLockedByEdit,
  type PermissionItem,
  type ModuleGroup,
} from '../lib/group-permissions';

type PermissionsFieldProps = {
  value: string[];
  onChange: (next: string[]) => void;
  items: readonly PermissionItem[] | undefined;
  isLoading?: boolean;
  disabled?: boolean;
};

/**
 * 角色表單的權限多選欄位：依 platform → module 分組、每組列 VIEW/EDIT、含全選/全不選
 * 互動規則：勾 EDIT 會自動勾 VIEW；當 EDIT 勾選時 VIEW 變 disabled 鎖在勾選狀態
 */
export const PermissionsField = ({
  value,
  onChange,
  items,
  isLoading,
  disabled,
}: PermissionsFieldProps) => {
  const selected = useMemo(() => new Set(value), [value]);
  const groups = useMemo(() => (items ? groupPermissions(items) : []), [items]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (groups.length === 0) {
    return <p className="text-muted-foreground text-sm">尚無可指派的權限</p>;
  }

  // 對 selected 做變動：clone → 變動 → sort → onChange，三個 toggle 共用這個樣板
  const mutateSelected = (apply: (next: Set<string>) => void) => {
    const next = new Set(selected);
    apply(next);
    onChange(Array.from(next).sort());
  };

  const toggleCode = (code: string, checked: boolean) => {
    mutateSelected((next) => {
      if (checked) next.add(code);
      else next.delete(code);
    });
  };

  // EDIT 勾選時自動把 VIEW 也加入；UI 已防止反向取消 VIEW，這裡僅作 onChange 來源處理
  const toggleEdit = (group: ModuleGroup, checked: boolean) => {
    const edit = group.edit;
    if (!edit) return;
    mutateSelected((next) => {
      if (checked) {
        next.add(edit.permissionCode);
        if (group.view) next.add(group.view.permissionCode);
      } else {
        next.delete(edit.permissionCode);
      }
    });
  };

  const toggleGroup = (group: ModuleGroup, checked: boolean) => {
    mutateSelected((next) => {
      if (checked) {
        if (group.view) next.add(group.view.permissionCode);
        if (group.edit) next.add(group.edit.permissionCode);
      } else {
        if (group.view) next.delete(group.view.permissionCode);
        if (group.edit) next.delete(group.edit.permissionCode);
      }
    });
  };

  return (
    <div className="max-h-[60vh] space-y-4 overflow-auto rounded-md border p-3">
      {groups.map((platform) => (
        <div key={platform.platform} className="space-y-2">
          <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {platform.platform}
          </div>
          <div className="space-y-2">
            {platform.modules.map((g) => {
              // 提前 narrow 成 const，閉包內就不必再 ! non-null assertion
              const view = g.view;
              const edit = g.edit;
              const viewChecked = !!view && selected.has(view.permissionCode);
              const editChecked = !!edit && selected.has(edit.permissionCode);
              const allChecked =
                (!view || viewChecked) && (!edit || editChecked);
              const viewLocked = isViewLockedByEdit(g, selected);
              return (
                <div key={g.module} className="rounded-sm border bg-card p-2">
                  <div className="flex items-center justify-between gap-2 border-b pb-1.5 mb-2">
                    <div className="text-sm font-medium">{g.module}</div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => toggleGroup(g, !allChecked)}
                    >
                      {allChecked ? '全不選' : '全選'}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2 pl-1">
                    {view ? (
                      viewLocked ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <label className="inline-flex w-fit cursor-not-allowed items-center gap-2 text-sm opacity-60">
                              <Checkbox
                                checked={true}
                                disabled
                                aria-label={`${g.module} 檢視（已鎖定）`}
                              />
                              <span>{view.name}</span>
                            </label>
                          </TooltipTrigger>
                          <TooltipContent>
                            啟用編輯時需具備檢視權限
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={viewChecked}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              toggleCode(view.permissionCode, checked === true)
                            }
                            aria-label={`${g.module} 檢視`}
                          />
                          <span>{view.name}</span>
                        </label>
                      )
                    ) : null}
                    {edit ? (
                      <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={editChecked}
                          disabled={disabled}
                          onCheckedChange={(checked) =>
                            toggleEdit(g, checked === true)
                          }
                          aria-label={`${g.module} 編輯`}
                        />
                        <span>{edit.name}</span>
                      </label>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
