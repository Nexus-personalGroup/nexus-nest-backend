import { describe, expect, it } from 'vitest';
import { render as baseRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { RoomMembersPanel } from './RoomMembersPanel';
import type { RoomMemberRow } from '../hooks/use-rooms-query';

const render = (ui: React.ReactElement) =>
  baseRender(
    <MemoryRouter>
      <TooltipPrimitive.Provider>{ui}</TooltipPrimitive.Provider>
    </MemoryRouter>,
  );

const member: RoomMemberRow = {
  memberId: '550e8400-e29b-41d4-a716-446655440000',
  email: 'alice@example.com',
  joinedAt: '2026-08-01T06:00:00.000Z',
};

describe('RoomMembersPanel', () => {
  // 動線的價值在完整：少了這一條，審閱者看到房間裡有誰之後就卡住了
  it('每位成員連往他的概覽頁', () => {
    render(<RoomMembersPanel members={[member]} />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/moderation/members/550e8400-e29b-41d4-a716-446655440000',
    );
  });

  /**
   * 帳號已刪除的成員仍列出且仍可點。
   *
   * 把他從清單裡拿掉會讓成員數與清單長度對不起來，
   * 而那種不一致看起來像 bug、查起來卻查不到原因。
   */
  it('帳號已刪除 → 顯示「已刪除的帳號」但仍可點', () => {
    render(<RoomMembersPanel members={[{ ...member, email: null }]} />);

    expect(screen.getByText(/已刪除的帳號/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('沒有成員 → 空狀態', () => {
    render(<RoomMembersPanel members={[]} />);

    expect(screen.getByText('這個房間沒有成員')).toBeInTheDocument();
  });

  // 房間詳情不是內容存取路徑：這裡不該出現任何通往訊息的東西
  it('⭐ 不含任何通往訊息的連結', () => {
    render(<RoomMembersPanel members={[member]} />);

    const links = screen.getAllByRole('link');
    expect(
      links.every((link) => !link.getAttribute('href')?.includes('message')),
    ).toBe(true);
  });
});
