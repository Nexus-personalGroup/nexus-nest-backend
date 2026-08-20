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
import { Label } from '@/components/ui/label';
import type { IpBlacklistForm } from '../lib/ip-blacklist-form-schema';

type IpBlacklistViewDialogProps = {
  open: boolean;
  values: Partial<IpBlacklistForm> | undefined;
  onClose: () => void;
};

/**
 * 純唯讀的黑名單檢視 dialog：不掛 react-hook-form / resolver / submit
 */
export const IpBlacklistViewDialog = ({
  open,
  values,
  onClose,
}: IpBlacklistViewDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>檢視黑名單</DialogTitle>
          <DialogDescription>檢視黑名單紀錄（唯讀）</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>IP 位址</Label>
            <Input value={values?.ip ?? ''} disabled readOnly />
          </div>
          <div className="flex flex-col gap-2">
            <Label>封鎖原因</Label>
            <Input value={values?.reason ?? ''} disabled readOnly />
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
