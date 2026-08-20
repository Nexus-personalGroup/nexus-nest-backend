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
import {
  createMemberFormSchema,
  updateMemberFormSchema,
  type CreateMemberForm,
} from '../lib/member-form-schema';
import { RoleCombobox } from './RoleCombobox';

type MemberFormDialogProps = {
  open: boolean;
  mode: 'create' | 'edit';
  /** edit 模式時帶入欄位預設值 */
  initialValues?: Partial<CreateMemberForm>;
  isSubmitting: boolean;
  onClose: () => void;
  /**
   * 提交時的回呼。edit 模式下若 password 為空字串會被剝掉，由父層決定是否帶到 PATCH body
   */
  onSubmit: (values: CreateMemberForm) => Promise<void> | void;
};

const DEFAULT_VALUES: CreateMemberForm = {
  email: '',
  member: '',
  password: '',
  roleId: '',
  status: true,
};

export const MemberFormDialog = ({
  open,
  mode,
  initialValues,
  isSubmitting,
  onClose,
  onSubmit,
}: MemberFormDialogProps) => {
  // 編輯模式允許密碼留空（schema 用 union(literal '' or 8-30) 表達），
  // 兩個 schema 的 password 都是 string 型別，form value 統一走 CreateMemberForm
  const form = useForm<CreateMemberForm>({
    resolver:
      mode === 'edit'
        ? standardSchemaResolver(updateMemberFormSchema)
        : standardSchemaResolver(createMemberFormSchema),
    defaultValues: { ...DEFAULT_VALUES, ...initialValues },
  });

  // dialog 開啟或 initialValues 變更時重置表單。
  // 父層需以 useMemo 穩定 initialValues 參考（MembersPage 已做），避免每次 render 都觸發 reset
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? '新增會員' : '編輯會員'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? '建立一個新會員帳號'
              : '更新會員資料；密碼欄留空則不更動'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="member"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>名稱</FormLabel>
                  <FormControl>
                    <Input placeholder="顯示名稱" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    密碼{' '}
                    {mode === 'edit' && (
                      <span className="text-muted-foreground text-xs font-normal">
                        （留空則不更動）
                      </span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete={mode === 'create' ? 'new-password' : 'off'}
                      placeholder={mode === 'create' ? '8-30 字元' : '••••••••'}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色</FormLabel>
                  <FormControl>
                    <RoleCombobox
                      value={field.value || ''}
                      onChange={field.onChange}
                      editingRoleId={
                        mode === 'edit' ? initialValues?.roleId : undefined
                      }
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
                      停用後該帳號將無法登入
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
