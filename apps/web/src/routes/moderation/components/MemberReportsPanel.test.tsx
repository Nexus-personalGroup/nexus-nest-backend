import { describe, expect, it, vi } from 'vitest';
import { render as baseRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { MemberReportsPanel } from './MemberReportsPanel';
import type { MemberReportRow } from '../hooks/use-member-profile-query';

// 元件內有 <Link> 與 Tooltip，兩者各自需要 provider
const render = (ui: React.ReactElement) =>
  baseRender(
    <MemoryRouter>
      <TooltipPrimitive.Provider>{ui}</TooltipPrimitive.Provider>
    </MemoryRouter>,
  );

const row: MemberReportRow = {
  reportId: 'rep-1',
  counterpartId: '550e8400-e29b-41d4-a716-446655440000',
  counterpartEmail: 'alice@example.com',
  roomId: 'room-1',
  reason: 'HARASSMENT',
  status: 'PENDING',
  createdAt: '2026-08-21T06:00:00.000Z',
};

const baseProps = {
  rows: [row],
  isLoading: false,
  role: 'TARGET' as const,
  page: 1,
  totalPages: 1,
  onRoleChange: vi.fn(),
  onPageChange: vi.fn(),
};

describe('MemberReportsPanel', () => {
  /**
   * 每一列顯示**對造**，不是這個人自己。
   *
   * 顯示自己的話每一列都會印出同一個 email——看起來像正常畫面，
   * 但完全沒有資訊量，而且不會有任何測試因此變紅。
   */
  it('查「被檢舉」時，對造欄位標示為檢舉人', () => {
    render(<MemberReportsPanel {...baseProps} role="TARGET" />);

    expect(screen.getByText('檢舉人')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('查「提出的」時，對造欄位標示為被檢舉人', () => {
    render(<MemberReportsPanel {...baseProps} role="REPORTER" />);

    expect(screen.getByText('被檢舉人')).toBeInTheDocument();
  });

  it('對造帳號已刪除 → 顯示「已刪除的帳號」而非空白', () => {
    render(
      <MemberReportsPanel
        {...baseProps}
        rows={[{ ...row, counterpartEmail: null }]}
      />,
    );

    expect(screen.getByText(/已刪除的帳號/)).toBeInTheDocument();
  });

  it('每一列連往該筆檢舉的詳情', () => {
    render(<MemberReportsPanel {...baseProps} />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/moderation/reports/rep-1',
    );
  });

  it('空清單 → 依方向顯示不同的空狀態', () => {
    const { unmount } = render(
      <MemberReportsPanel {...baseProps} rows={[]} role="TARGET" />,
    );
    expect(screen.getByText('沒有被檢舉的紀錄')).toBeInTheDocument();
    unmount();

    render(<MemberReportsPanel {...baseProps} rows={[]} role="REPORTER" />);
    expect(screen.getByText('沒有提出過檢舉')).toBeInTheDocument();
  });

  it('切換方向 → 呼叫 onRoleChange', async () => {
    const onRoleChange = vi.fn();
    render(<MemberReportsPanel {...baseProps} onRoleChange={onRoleChange} />);

    await userEvent.click(screen.getByRole('button', { name: '提出的' }));

    expect(onRoleChange).toHaveBeenCalledWith('REPORTER');
  });

  it('只有一頁時不顯示分頁控制', () => {
    render(<MemberReportsPanel {...baseProps} totalPages={1} />);

    expect(
      screen.queryByRole('button', { name: '下一頁' }),
    ).not.toBeInTheDocument();
  });
});
