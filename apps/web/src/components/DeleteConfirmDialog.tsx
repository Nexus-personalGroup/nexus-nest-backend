import type { ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type DeleteConfirmDialogProps = {
  open: boolean;
  title: string;
  /** 描述內容；可帶 highlighted entity name 等 ReactNode */
  description: ReactNode;
  /** 確認按鈕的處理中文案；預設「刪除中…」 */
  pendingLabel?: string;
  /** 確認按鈕文案；預設「確認刪除」 */
  confirmLabel?: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * 列表頁「硬刪確認」共用 AlertDialog。
 * 收斂 members / roles / security 各自寫一份 inline AlertDialog 的樣板
 */
export const DeleteConfirmDialog = ({
  open,
  title,
  description,
  pendingLabel = '刪除中…',
  confirmLabel = '確認刪除',
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={isDeleting} onClick={onConfirm}>
            {isDeleting ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
