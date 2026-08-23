import { describe, expect, it, vi } from 'vitest';
import { render as baseRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { FrontUserActions } from './FrontUserActions';

// 無權限時 DisabledHint 會包 Tooltip，而 Tooltip 需要 Provider
const render = (ui: React.ReactElement) =>
  baseRender(<TooltipPrimitive.Provider>{ui}</TooltipPrimitive.Provider>);

const baseProps = {
  status: true,
  canEdit: true,
  isPending: false,
  onSuspend: vi.fn(),
  onReinstate: vi.fn(),
  onForceLogout: vi.fn(),
};

describe('FrontUserActions', () => {
  it('啟用中 → 只顯示停權，不顯示解除', () => {
    render(<FrontUserActions {...baseProps} status />);

    expect(screen.getByRole('button', { name: /停權/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /解除停權/ }),
    ).not.toBeInTheDocument();
  });

  it('已停權 → 只顯示解除', () => {
    render(<FrontUserActions {...baseProps} status={false} />);

    expect(
      screen.getByRole('button', { name: /解除停權/ }),
    ).toBeInTheDocument();
  });

  /**
   * 沿用檢舉審閱的判準：隱藏會讓人以為功能不存在，然後去問
   * 「為什麼我不能停權」——停用加上理由則當場回答了那個問題。
   */
  it('⭐ 沒有 EDIT 權限 → 動作 disabled 而非隱藏', () => {
    render(<FrontUserActions {...baseProps} canEdit={false} />);

    expect(screen.getByRole('button', { name: /停權/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /強制登出/ })).toBeDisabled();
  });

  it('停權要先過確認對話框', async () => {
    const onSuspend = vi.fn();
    render(<FrontUserActions {...baseProps} onSuspend={onSuspend} />);

    await userEvent.click(screen.getByRole('button', { name: /停權/ }));

    expect(onSuspend).not.toHaveBeenCalled();
    expect(screen.getByText('停權這個會員？')).toBeInTheDocument();
  });

  it('確認後才真的送出', async () => {
    const onSuspend = vi.fn();
    render(<FrontUserActions {...baseProps} onSuspend={onSuspend} />);

    await userEvent.click(screen.getByRole('button', { name: /停權/ }));
    await userEvent.click(screen.getByRole('button', { name: '停權' }));

    expect(onSuspend).toHaveBeenCalledTimes(1);
  });

  it('取消則不送出', async () => {
    const onSuspend = vi.fn();
    render(<FrontUserActions {...baseProps} onSuspend={onSuspend} />);

    await userEvent.click(screen.getByRole('button', { name: /停權/ }));
    await userEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onSuspend).not.toHaveBeenCalled();
  });

  /**
   * 強制登出是可逆的（對方重新登入即可），加確認只會讓人養成
   * 「看到對話框就按確定」的習慣，而那會反過來削弱停權那一個的效果。
   */
  it('⭐ 強制登出不需要二次確認，直接送出', async () => {
    const onForceLogout = vi.fn();
    render(<FrontUserActions {...baseProps} onForceLogout={onForceLogout} />);

    await userEvent.click(screen.getByRole('button', { name: /強制登出/ }));

    expect(onForceLogout).toHaveBeenCalledTimes(1);
  });

  /**
   * 兩個動作的圖示與文案相近，而按錯的成本不對稱。
   * 說明文字是使用者當場分辨它們的唯一依據。
   */
  it('⭐ 強制登出附帶「帳號仍可使用」的說明', () => {
    render(<FrontUserActions {...baseProps} />);

    expect(screen.getByText(/帳號仍可使用/)).toBeInTheDocument();
  });

  it('處置進行中 → 動作全部 disabled', () => {
    render(<FrontUserActions {...baseProps} isPending />);

    expect(screen.getByRole('button', { name: /停權/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /強制登出/ })).toBeDisabled();
  });
});
