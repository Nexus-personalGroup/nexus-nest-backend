import { describe, expect, it } from 'vitest';
import { render as baseRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { MemberRoomsPanel } from './MemberRoomsPanel';

const render = (ui: React.ReactElement) =>
  baseRender(
    <MemoryRouter>
      <TooltipPrimitive.Provider>{ui}</TooltipPrimitive.Provider>
    </MemoryRouter>,
  );

const room = {
  id: '880e8400-e29b-41d4-a716-446655440003',
  roomType: 'GROUP' as const,
  name: '午餐團',
  memberCount: 5,
  createdAt: '2026-08-01T06:00:00.000Z',
};

describe('MemberRoomsPanel', () => {
  it('每個房間連往它的詳情頁', () => {
    render(<MemberRoomsPanel rooms={[room]} isLoading={false} />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/moderation/rooms/880e8400-e29b-41d4-a716-446655440003',
    );
  });

  // 私聊的顯示名由對方決定、不落庫，後端回 null
  it('私聊顯示「私聊」而非空白', () => {
    render(
      <MemberRoomsPanel
        rooms={[{ ...room, roomType: 'DIRECT', name: null }]}
        isLoading={false}
      />,
    );

    expect(screen.getByRole('link')).toHaveTextContent('私聊');
  });

  it('不在任何房間 → 空狀態', () => {
    render(<MemberRoomsPanel rooms={[]} isLoading={false} />);

    expect(screen.getByText('不在任何聊天室')).toBeInTheDocument();
  });
});
