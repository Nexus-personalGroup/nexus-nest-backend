import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { RoleFormValues } from '../lib/role-form-schema';
import { usePermissionOptionsQuery } from '../hooks/use-permission-options-query';
import { PermissionsField } from './PermissionsField';

type RoleViewDialogProps = {
  open: boolean;
  values: Partial<RoleFormValues> | undefined;
  onClose: () => void;
};

/**
 * 純唯讀的角色檢視 dialog：不掛 react-hook-form / resolver / submit。
 * 展示 name / permissionCodes / status；permissions 仍用 PermissionsField 渲染（disabled）
 */
export const RoleViewDialog = ({
  open,
  values,
  onClose,
}: RoleViewDialogProps) => {
  const permissionOptions = usePermissionOptionsQuery();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>檢視角色</DialogTitle>
          <DialogDescription>檢視角色資料（唯讀）</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>名稱</Label>
            <Input value={values?.name ?? ''} disabled readOnly />
          </div>

          <div className="flex flex-col gap-2">
            <Label>權限</Label>
            <PermissionsField
              value={values?.permissionCodes ?? []}
              onChange={() => {}}
              items={permissionOptions.data}
              isLoading={permissionOptions.isLoading}
              disabled
            />
          </div>

          <div className="flex flex-row items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label>啟用狀態</Label>
              <p className="text-muted-foreground text-xs">
                停用後該角色將無法被指派
              </p>
            </div>
            <Switch checked={values?.status ?? true} disabled />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            關閉
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
