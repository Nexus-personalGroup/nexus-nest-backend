import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

const baseProps = {
  title: '刪除角色',
  description: '此操作無法復原',
  isDeleting: false,
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
};

describe('DeleteConfirmDialog', () => {
  it('open=false 時不顯示內容', () => {
    render(<DeleteConfirmDialog {...baseProps} open={false} />);
    expect(screen.queryByText('刪除角色')).not.toBeInTheDocument();
  });

  it('open=true 時顯示標題與描述', () => {
    render(<DeleteConfirmDialog {...baseProps} open />);
    expect(screen.getByText('刪除角色')).toBeInTheDocument();
    expect(screen.getByText('此操作無法復原')).toBeInTheDocument();
  });

  it('點確認刪除 → 呼叫 onConfirm', async () => {
    const onConfirm = vi.fn();
    render(<DeleteConfirmDialog {...baseProps} open onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: '確認刪除' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('isDeleting=true → 顯示 pendingLabel 且兩顆按鈕 disabled', () => {
    render(<DeleteConfirmDialog {...baseProps} open isDeleting />);
    expect(screen.getByRole('button', { name: '刪除中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
  });

  it('自訂 confirmLabel 生效', () => {
    render(<DeleteConfirmDialog {...baseProps} open confirmLabel="永久刪除" />);
    expect(
      screen.getByRole('button', { name: '永久刪除' }),
    ).toBeInTheDocument();
  });
});
