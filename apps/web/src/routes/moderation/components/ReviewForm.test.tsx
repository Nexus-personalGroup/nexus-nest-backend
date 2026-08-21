import { describe, expect, it, vi } from 'vitest';
import { render as baseRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { ReviewForm } from './ReviewForm';

const render = (ui: React.ReactElement) =>
  baseRender(<TooltipPrimitive.Provider>{ui}</TooltipPrimitive.Provider>);

const baseProps = {
  canEdit: true,
  isSubmitting: false,
  defaultNote: '',
  onSubmit: vi.fn(),
};

describe('ReviewForm', () => {
  it('送出時帶上判定結果', async () => {
    const onSubmit = vi.fn();
    render(<ReviewForm {...baseProps} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: '送出判定' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'REVIEWED' }),
        expect.anything(),
      );
    });
  });

  /**
   * 上限與後端一致（500 字）。
   *
   * 不一致的話使用者會打完一整段才被伺服器打回——而那時他已經失去了剛才寫的內容，
   * 因為表單不會替他留著。
   */
  it('註記超過 500 字 → 擋下且不送出', async () => {
    const onSubmit = vi.fn();
    render(<ReviewForm {...baseProps} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('textbox'));
    // paste 而非 type：501 次按鍵在測試裡太慢
    await userEvent.paste('字'.repeat(501));
    await userEvent.click(screen.getByRole('button', { name: '送出判定' }));

    await waitFor(() => {
      expect(screen.getByText('處理註記最多 500 字')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('剛好 500 字 → 放行', async () => {
    const onSubmit = vi.fn();
    render(<ReviewForm {...baseProps} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.paste('字'.repeat(500));
    await userEvent.click(screen.getByRole('button', { name: '送出判定' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  it('只有 VIEW 權限 → 表單停用', () => {
    render(<ReviewForm {...baseProps} canEdit={false} />);

    expect(screen.getByRole('button', { name: '送出判定' })).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  /**
   * 後端不接受回到 PENDING，提供一個必然被拒的選項只會製造挫折。
   *
   * 下拉能在 jsdom 展開，靠的是 `src/test/setup.ts` 補上的 pointer capture 與
   * `scrollIntoView`——Radix 依賴它們，而 jsdom 兩者都沒有。
   */
  it('沒有「回到待處理」的選項', async () => {
    render(<ReviewForm {...baseProps} />);

    await userEvent.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: '已處理' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: '已駁回' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: '待處理' }),
    ).not.toBeInTheDocument();
  });

  it('帶入既有註記作為初值', () => {
    render(<ReviewForm {...baseProps} defaultNote="先前的判定理由" />);

    expect(screen.getByRole('textbox')).toHaveValue('先前的判定理由');
  });
});
