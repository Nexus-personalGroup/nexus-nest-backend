import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import type { MemberRow } from './MembersTable';

type DeleteMemberDialogProps = {
  member: MemberRow | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: (member: MemberRow) => void;
};

export const DeleteMemberDialog = ({
  member,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteMemberDialogProps) => {
  return (
    <DeleteConfirmDialog
      open={!!member}
      title="確認刪除會員"
      description={
        <>
          即將刪除
          <span className="text-foreground font-medium">
            {' '}
            {member?.member ?? '—'}{' '}
          </span>
          ({member?.email ?? '—'})。確認繼續嗎？
        </>
      }
      isDeleting={isDeleting}
      onCancel={onCancel}
      onConfirm={() => member && onConfirm(member)}
    />
  );
};
