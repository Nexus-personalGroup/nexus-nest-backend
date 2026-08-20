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
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { roleFormSchema, type RoleFormValues } from '../lib/role-form-schema';
import { usePermissionOptionsQuery } from '../hooks/use-permission-options-query';
import { PermissionsField } from './PermissionsField';

type RoleFormDialogProps = {
  open: boolean;
  mode: 'create' | 'edit';
  initialValues?: Partial<RoleFormValues>;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: RoleFormValues) => Promise<void> | void;
};

const DEFAULT_VALUES: RoleFormValues = {
  name: '',
  permissionCodes: [],
  status: true,
};

export const RoleFormDialog = ({
  open,
  mode,
  initialValues,
  isSubmitting,
  onClose,
  onSubmit,
}: RoleFormDialogProps) => {
  const permissionOptions = usePermissionOptionsQuery();

  const form = useForm<RoleFormValues>({
    resolver: standardSchemaResolver(roleFormSchema),
    defaultValues: { ...DEFAULT_VALUES, ...initialValues },
  });

  // dialog 開啟或 initialValues 變更時重置表單。
  // 父層需以 useMemo 穩定 initialValues 參考，避免每次 render 都 reset
  useEffect(() => {
    if (open) {
      form.reset({ ...DEFAULT_VALUES, ...initialValues });
    }
  }, [open, initialValues, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? '新增角色' : '編輯角色'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? '建立角色並指派可用權限'
              : '更新角色名稱、權限或啟用狀態'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>名稱</FormLabel>
                  <FormControl>
                    <Input placeholder="角色名稱" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="permissionCodes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>權限</FormLabel>
                  <FormControl>
                    <PermissionsField
                      value={field.value}
                      onChange={field.onChange}
                      items={permissionOptions.data}
                      isLoading={permissionOptions.isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>啟用狀態</FormLabel>
                    <p className="text-muted-foreground text-xs">
                      停用後該角色將無法被指派
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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
