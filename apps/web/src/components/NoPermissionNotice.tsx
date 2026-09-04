import { ShieldOff } from 'lucide-react';

type NoPermissionNoticeProps = {
  /** 缺少的權限碼或角色代碼；顯示出來使用者才說得出自己要什麼 */
  required?: string;
};

/**
 * 權限不足時就地渲染的說明。
 *
 * **就地渲染而不導頁**：導回首頁會讓使用者以為自己點錯了，然後再試一次、
 * 再被彈走，而沒有任何東西告訴他要去要權限。
 * 也不用 `/403` 之類的路由——那會在瀏覽器歷史多一筆，
 * 返回鍵會回到沒權限的網址再被踢一次。
 *
 * **會標示缺少的權限碼**：這是內部後台，使用者拿得到碼才說得出自己要什麼，
 * 否則管理員收到的是「我進不去某一頁」。權限碼在角色管理頁本來就看得到。
 */
export const NoPermissionNotice = ({ required }: NoPermissionNoticeProps) => (
  <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
    <ShieldOff className="text-muted-foreground size-10" aria-hidden />
    <h1 className="text-lg font-semibold">沒有存取權限</h1>
    <p className="text-muted-foreground text-sm">
      你的帳號沒有這個頁面所需的權限，請聯絡管理員開通。
    </p>
    {required && (
      <p className="text-muted-foreground text-xs">
        需要的權限：<code className="font-mono">{required}</code>
      </p>
    )}
  </div>
);
