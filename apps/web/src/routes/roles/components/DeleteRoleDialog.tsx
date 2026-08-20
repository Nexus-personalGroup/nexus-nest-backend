import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import type { RoleRow } from './RolesTable';

type DeleteRoleDialogProps = {
  role: RoleRow | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: (role: RoleRow) => void;
};

export const DeleteRoleDialog = ({
  role,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteRoleDialogProps) => {
  return (
    <DeleteConfirmDialog
      open={!!role}
      title="確認刪除角色"
      description={
        <>
          即將刪除
          <span className="text-foreground font-medium">
            {' '}
            {role?.name ?? '—'}{' '}
          </span>
          （目前使用人數：{role?.memberCount ?? 0}）。確認繼續嗎？
        </>
      }
      isDeleting={isDeleting}
      onCancel={onCancel}
      onConfirm={() => role && onConfirm(role)}
    />
  );
};
