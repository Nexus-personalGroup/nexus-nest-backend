import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  /** 副標；說明這一頁管的是什麼，不重複標題 */
  description?: ReactNode;
  /** 右側的動作區（新增按鈕、篩選器）；沒有時排版會自動改為單欄 */
  children?: ReactNode;
};

/**
 * 列表頁的頁首。
 *
 * **存在的理由是「照抄前一頁」會抄歪。** 八個列表頁原本各自手寫這段結構，
 * 而 `add-account-lock-management`（#37）新加的那頁三處都偏了
 * （多了 `p-6`、頁首用 `<div>` 而非 `<header>`、標題 `font-bold` 而非
 * `font-semibold`）——**typecheck / lint / 測試全綠**，是用眼睛看出來的。
 *
 * 刻意**不加守則**擋這件事：五個明細頁本來就沒有這層結構，
 * 規則放寬到能容納它們之後就抓不到偏差了，而會誤報的守則會被繞過。
 * 用元件取代規則——沒有可以寫歪的地方，就不需要有人記得寫對。
 *
 * 有無動作區的排版差異也收進來：`front-users` 沒有動作、其餘有，
 * 原本靠各頁自己選要不要加 flex，那正是下一個分歧的來源。
 */
export const PageHeader = ({
  title,
  description,
  children,
}: PageHeaderProps) => (
  <header
    className={
      children ? 'flex flex-wrap items-center justify-between gap-3' : undefined
    }
  >
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
    </div>
    {children}
  </header>
);
