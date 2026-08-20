import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';

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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  ipWhitelistFormSchema,
  type IpWhitelistForm,
} from '../lib/ip-whitelist-form-schema';

type IpWhitelistFormDialogProps = {
  open: boolean;
  mode: 'create' | 'edit';
  initialValues?: Partial<IpWhitelistForm>;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: IpWhitelistForm) => Promise<void> | void;
};

const DEFAULT_VALUES: IpWhitelistForm = {
  ip: '',
  description: '',
};

export const IpWhitelistFormDialog = ({
  open,
  mode,
  initialValues,
  isSubmitting,
  onClose,
  onSubmit,
}: IpWhitelistFormDialogProps) => {
  // IP 在 edit 時 disabled（後端不允許改 IP，要改就刪除後重建）
  const ipDisabled = mode === 'edit';

  const form = useForm<IpWhitelistForm>({
    resolver: standardSchemaResolver(ipWhitelistFormSchema),
    defaultValues: { ...DEFAULT_VALUES, ...initialValues },
  });

  useEffect(() => {
    if (open) form.reset({ ...DEFAULT_VALUES, ...initialValues });
  }, [open, initialValues, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? '新增白名單' : '編輯白名單'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? '加入新的 IP 到白名單'
              : '更新備註說明（IP 不可變更，要改 IP 請刪除後重建）'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="ip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IP 位址</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="192.168.1.1"
                      disabled={ipDisabled}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>備註</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：辦公室 IP" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? '儲存中…' : mode === 'create' ? '新增' : '儲存'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
