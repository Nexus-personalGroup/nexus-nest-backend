import { describe, expect, it, vi } from 'vitest';
import { render as baseRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { ReportActions } from './ReportActions';

// 無權限時 DisabledHint 會包 Tooltip，而 Tooltip 需要 Provider。
// App.tsx 在根部提供了一個，測試要自己補上
const render = (ui: React.ReactElement) =>
  baseRender(
    <TooltipPrimitive.Provider>{ui}</TooltipPrimitive.Provider>,
  );

const baseProps = {
  targetMessageRemovedAt: null,
  canEdit: true,
  isPending: false,
  onRemoveMessage: vi.fn(),
  onRestoreMessage: vi.fn(),
  onSuspendMember: vi.fn(),
  onReinstateMember: vi.fn(),
};

describe('ReportActions', () => {
  /**
   * 兩者互斥。同時顯示會讓管理員必須自己判斷訊息現在是什麼狀態，
   * 而那正是後端補 `targetMessageRemovedAt` 要解決的問題。
   */
  it('訊息未被移除 → 只顯示「移除訊息」', () => {
    render(<ReportActions {...baseProps} targetMessageRemovedAt={null} />);

    expect(
      screen.getByRole('button', { name: /移除訊息/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /還原訊息/ }),
    ).not.toBeInTheDocument();
  });

  it('訊息已被移除 → 只顯示「還原訊息」', () => {
    render(
      <ReportActions
        {...baseProps}
        targetMessageRemovedAt="2026-08-21T06:00:00.000Z"
      />,
    );

    expect(
      screen.getByRole('button', { name: /還原訊息/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /移除訊息/ }),
    ).not.toBeInTheDocument();
  });

  /**
   * 沒有權限時停用而非隱藏。
   *
   * 隱藏會讓人以為功能不存在，然後去問「為什麼我不能移除訊息」——
   * 停用則當場回答了那個問題。
   */
  it('只有 VIEW 權限 → 動作全部 disabled 但仍然看得到', () => {
    render(<ReportActions {...baseProps} canEdit={false} />);

    expect(screen.getByRole('button', { name: /移除訊息/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /停權成員/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /解除停權/ })).toBeDisabled();
  });

  it('處置進行中 → 動作 disabled，避免重複送出', () => {
    render(<ReportActions {...baseProps} isPending />);

    expect(screen.getByRole('button', { name: /移除訊息/ })).toBeDisabled();
  });

  // 這些動作對真人有實質影響，不該一鍵就送出去
  it('點移除不會直接執行，先跳確認', async () => {
    const onRemoveMessage = vi.fn();
    render(<ReportActions {...baseProps} onRemoveMessage={onRemoveMessage} />);

    await userEvent.click(screen.getByRole('button', { name: /移除訊息/ }));

    expect(onRemoveMessage).not.toHaveBeenCalled();
    expect(screen.getByText('移除這則訊息？')).toBeInTheDocument();
  });

  it('確認後才真正執行', async () => {
    const onRemoveMessage = vi.fn();
    render(<ReportActions {...baseProps} onRemoveMessage={onRemoveMessage} />);

    await userEvent.click(screen.getByRole('button', { name: /移除訊息/ }));
    await userEvent.click(screen.getByRole('button', { name: '移除訊息' }));

    expect(onRemoveMessage).toHaveBeenCalledTimes(1);
  });

  // 停權會斷開既有的 WebSocket 連線，那是使用者看得到的後果，必須先說
  it('停權的確認視窗說明會中斷既有連線', async () => {
    render(<ReportActions {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: /停權成員/ }));

    expect(screen.getByText(/既有的即時連線會立刻中斷/)).toBeInTheDocument();
  });

  it('取消不會執行動作', async () => {
    const onSuspendMember = vi.fn();
    render(<ReportActions {...baseProps} onSuspendMember={onSuspendMember} />);

    await userEvent.click(screen.getByRole('button', { name: /停權成員/ }));
    await userEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onSuspendMember).not.toHaveBeenCalled();
  });
});
