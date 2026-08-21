import { useState, type ReactElement } from 'react';
import { RotateCcw, ShieldBan, ShieldCheck, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { DisabledHint } from '@/components/DisabledHint';
import { messageActionFor } from '../lib/moderation-display';

/** 一個待確認的處置動作 */
type PendingAction = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => void;
};

type ReportActionsProps = {
  targetMessageRemovedAt: string | null | undefined;
  /** 是否有 BACKEND:MODERATION:EDIT */
  canEdit: boolean;
  isPending: boolean;
  onRemoveMessage: () => void;
  onRestoreMessage: () => void;
  onSuspendMember: () => void;
  onReinstateMember: () => void;
};

const NO_PERMISSION = '無處置權限';

/**
 * 處置動作區
 *
 * 沒有 EDIT 權限時**停用而非隱藏**：隱藏會讓人以為功能不存在，
 * 然後去問「為什麼我不能移除訊息」——停用加上理由則當場回答了那個問題。
 */
export const ReportActions = ({
  targetMessageRemovedAt,
  canEdit,
  isPending,
  onRemoveMessage,
  onRestoreMessage,
  onSuspendMember,
  onReinstateMember,
}: ReportActionsProps) => {
  const [pending, setPending] = useState<PendingAction | null>(null);

  // 移除與還原二選一：同時顯示會讓管理員必須自己判斷訊息現在是什麼狀態，
  // 而那正是後端補 targetMessageRemovedAt 要解決的問題
  const messageAction = messageActionFor(targetMessageRemovedAt);

  const confirm = (action: PendingAction) => () => setPending(action);

  const actions: { key: string; node: ReactElement }[] = [
    {
      key: 'message',
      node:
        messageAction === 'remove' ? (
          <Button
            variant="destructive"
            disabled={!canEdit || isPending}
            onClick={confirm({
              title: '移除這則訊息？',
              description:
                '訊息將對所有人隱藏，但內容會保留在資料庫中供調查。此操作可還原，且會留下稽核紀錄。',
              confirmLabel: '移除訊息',
              run: onRemoveMessage,
            })}
          >
            <Trash2 />
            移除訊息
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={!canEdit || isPending}
            onClick={confirm({
              title: '還原這則訊息？',
              description:
                '訊息將重新對所有人顯示。若它同時被使用者撤回過，撤回狀態不受影響。此操作會留下稽核紀錄。',
              confirmLabel: '還原訊息',
              run: onRestoreMessage,
            })}
          >
            <RotateCcw />
            還原訊息
          </Button>
        ),
    },
    {
      key: 'suspend',
      node: (
        <Button
          variant="destructive"
          disabled={!canEdit || isPending}
          onClick={confirm({
            title: '停權這個成員？',
            description:
              '該成員將無法登入，且既有的即時連線會立刻中斷——連線層的認證只在建立連線時執行一次，不主動斷開的話他仍能繼續發言。此操作會留下稽核紀錄。',
            confirmLabel: '停權',
            run: onSuspendMember,
          })}
        >
          <ShieldBan />
          停權成員
        </Button>
      ),
    },
    {
      key: 'reinstate',
      node: (
        <Button
          variant="outline"
          disabled={!canEdit || isPending}
          onClick={confirm({
            title: '解除這個成員的停權？',
            description: '該成員將可以重新登入與發言。此操作會留下稽核紀錄。',
            confirmLabel: '解除停權',
            run: onReinstateMember,
          })}
        >
          <ShieldCheck />
          解除停權
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map(({ key, node }) => (
          <DisabledHint
            key={key}
            reason={canEdit ? '' : NO_PERMISSION}
            side="top"
          >
            {node}
          </DisabledHint>
        ))}
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                pending?.run();
                setPending(null);
              }}
            >
              {pending?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
