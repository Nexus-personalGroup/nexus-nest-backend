import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TooltipProvider } from '@/components/ui/tooltip';
import { AccountLocksTable, type AccountLockRow } from './AccountLocksTable';

const LOCKED: AccountLockRow = {
  id: 'a',
  email: 'locked@test.com',
  member: '被鎖的人',
  lockedAt: '2026-09-02T11:50:00.000Z',
  unlocksAt: '2026-09-02T12:20:00.000Z',
  failedLoginCount: 3,
  status: 'locked',
};

const EXPIRED: AccountLockRow = {
  ...LOCKED,
  id: 'b',
  email: 'expired@test.com',
  status: 'expired',
};

const renderTable = (data: AccountLockRow[]) => {
  const onUnlock = vi.fn();
  render(
    <TooltipProvider>
      <AccountLocksTable data={data} onUnlock={onUnlock} />
    </TooltipProvider>,
  );
  return { onUnlock };
};

const unlockButtons = () => screen.getAllByRole('button', { name: /解鎖/ });

describe('AccountLocksTable', () => {
  it('狀態以文字呈現，不是只給時間讓人心算', () => {
    renderTable([LOCKED, EXPIRED]);

    expect(screen.getByText('鎖定中')).toBeInTheDocument();
    expect(screen.getByText('已到期')).toBeInTheDocument();
  });

  /**
   * ⭐ 後端對非鎖定中的帳號回 409，**按下去必定失敗的按鈕比沒有按鈕更糟**。
   *
   * 用 disabled 而非隱藏：這是資料狀態不是權限——使用者需要知道
   * 「這個人已經可以登入了」，而不是以為功能不見了。
   */
  it('⭐ 已到期的列不得有可按的解鎖', async () => {
    const { onUnlock } = renderTable([EXPIRED]);

    const button = unlockButtons()[0];
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('⭐ 已到期的列仍然顯示解鎖（disabled），不是隱藏', () => {
    renderTable([EXPIRED]);

    expect(unlockButtons()).toHaveLength(1);
  });

  it('鎖定中的列可以按下解鎖', async () => {
    const { onUnlock } = renderTable([LOCKED]);

    await userEvent.click(unlockButtons()[0]);

    expect(onUnlock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'locked@test.com' }),
    );
  });

  /** 沒有帳號被鎖定是好消息；「無資料」看起來像載入失敗 */
  it('⭐ 空狀態的文案表達「沒有帳號被鎖定」', () => {
    renderTable([]);

    expect(screen.getByText('目前沒有帳號被鎖定')).toBeInTheDocument();
  });
});
