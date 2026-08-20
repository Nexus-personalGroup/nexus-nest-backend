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
import type { CreateMemberForm } from '../lib/member-form-schema';
import { RoleCombobox } from './RoleCombobox';

type MemberViewDialogProps = {
  open: boolean;
  values: Partial<CreateMemberForm> | undefined;
  onClose: () => void;
};

/**
 * 純唯讀的會員檢視 dialog：不掛 react-hook-form / resolver / submit。
 * 只展示 email / name / role / status 四個欄位（密碼欄不顯示）
 */
export const MemberViewDialog = ({
  open,
  values,
  onClose,
}: MemberViewDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>檢視會員</DialogTitle>
          <DialogDescription>檢視會員資料（唯讀）</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Email</Label>
            <Input value={values?.email ?? ''} disabled readOnly />
          </div>
          <div className="flex flex-col gap-2">
            <Label>名稱</Label>
            <Input value={values?.member ?? ''} disabled readOnly />
          </div>
          <div className="flex flex-col gap-2">
            <Label>角色</Label>
            {/* 沿用 RoleCombobox 的顯示邏輯（會處理 fallback option） */}
            <RoleCombobox
              value={values?.roleId ?? ''}
              onChange={() => {}}
              editingRoleId={values?.roleId}
              disabled
            />
          </div>
          <div className="flex flex-row items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label>啟用狀態</Label>
              <p className="text-muted-foreground text-xs">
                停用後該帳號將無法登入
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
