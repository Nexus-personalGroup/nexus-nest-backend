import { useState } from 'react';
import { LogOut, ShieldBan, ShieldCheck } from 'lucide-react';

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
import { NO_EDIT_PERMISSION } from '../lib/front-user-display';

type PendingAction = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => void;
};

type FrontUserActionsProps = {
  /** 目前的帳號狀態；決定顯示停權還是解除 */
  status: boolean;
  /** 是否有 BACKEND:FRONT_USER:EDIT */
  canEdit: boolean;
  isPending: boolean;
  onSuspend: () => void;
  onReinstate: () => void;
  onForceLogout: () => void;
};

/**
 * 處置動作區。
 *
 * **停權與強制登出刻意不並排**：兩者的圖示與文案都相近，而按錯的成本不對稱——
 * 停權會讓對方再也登不進來（使用者感受得到），強制登出只要重新登入就好。
 * 因此強制登出放在一般動作區，停權／解除獨立成一個危險區塊。
 *
 * 沒有 EDIT 權限時**停用而非隱藏**：隱藏會讓人以為功能不存在，然後去問
 * 「為什麼我不能停權」——停用加上理由則當場回答了那個問題。
 * （與檢舉審閱的處置動作同一個判準。）
 */
export const FrontUserActions = ({
  status,
  canEdit,
  isPending,
  onSuspend,
  onReinstate,
  onForceLogout,
}: FrontUserActionsProps) => {
  const [pending, setPending] = useState<PendingAction | null>(null);

  const confirm = (action: PendingAction) => () => setPending(action);

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">一般動作</p>
          <DisabledHint reason={canEdit ? '' : NO_EDIT_PERMISSION} side="top">
            <Button
              variant="outline"
              disabled={!canEdit || isPending}
              onClick={onForceLogout}
            >
              <LogOut />
              強制登出所有裝置
            </Button>
          </DisabledHint>
          {/* 這句是使用者當場分辨兩個動作的唯一依據，不可省略 */}
          <p className="text-muted-foreground text-xs">
            讓該會員所有裝置的憑證立即失效。帳號仍可使用，重新登入即可——
            用於「帳號可能外洩」，與停權不同。
          </p>
        </div>

        <div className="border-destructive/30 flex flex-col gap-2 rounded-md border p-3">
          <p className="text-destructive text-xs font-medium">危險操作</p>
          <DisabledHint reason={canEdit ? '' : NO_EDIT_PERMISSION} side="top">
            {status ? (
              <Button
                variant="destructive"
                disabled={!canEdit || isPending}
                onClick={confirm({
                  title: '停權這個會員？',
                  description:
                    '該會員將無法登入，且既有的即時連線會立刻中斷——連線層的認證只在建立連線時執行一次，不主動斷開的話他仍能繼續發言。此操作會留下稽核紀錄。',
                  confirmLabel: '停權',
                  run: onSuspend,
                })}
              >
                <ShieldBan />
                停權
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={!canEdit || isPending}
                onClick={confirm({
                  title: '解除這個會員的停權？',
                  description:
                    '該會員將可以重新登入與發言。停權時簽發的舊憑證仍然無效，他需要重新登入。此操作會留下稽核紀錄。',
                  confirmLabel: '解除停權',
                  run: onReinstate,
                })}
              >
                <ShieldCheck />
                解除停權
              </Button>
            )}
          </DisabledHint>
        </div>
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
