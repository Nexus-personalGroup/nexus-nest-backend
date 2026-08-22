import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render as baseRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { DashboardPage } from './page';
import type { DashboardSnapshot } from '../hooks/use-dashboard-stream';

const streamState = {
  snapshot: null as DashboardSnapshot | null,
  connected: true,
};

vi.mock('../hooks/use-dashboard-stream', () => ({
  useDashboardStream: () => streamState,
}));

vi.mock('@/lib/use-has-permission', () => ({
  useHasPermission: () => true,
}));

const render = () =>
  baseRender(
    <MemoryRouter>
      <TooltipPrimitive.Provider>
        <DashboardPage />
      </TooltipPrimitive.Provider>
    </MemoryRouter>,
  );

const snapshot: DashboardSnapshot = {
  onlineMembers: 12,
  pendingReports: 3,
  totalRooms: 48,
  totalMembers: 156,
  messagesToday: 1204,
  generatedAt: new Date().toISOString(),
};

describe('DashboardPage', () => {
  beforeEach(() => {
    streamState.snapshot = snapshot;
    streamState.connected = true;
  });

  it('渲染五個數字', () => {
    render();

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText('156')).toBeInTheDocument();
    expect(screen.getByText('1204')).toBeInTheDocument();
  });

  /**
   * **這是這個頁面最重要的規則。**
   *
   * 一個安靜地顯示 20 分鐘前數字的儀表板比沒有儀表板更糟——
   * 它讓人以為自己知道現況，而營運會依它做判斷。
   */
  it('⭐ 串流中斷 → 顯示中斷提示', () => {
    streamState.connected = false;
    render();

    expect(screen.getByText(/連線中斷/)).toBeInTheDocument();
  });

  it('⭐ 串流中斷 → 數字帶上「過期」的樣式', () => {
    streamState.connected = false;
    render();

    expect(screen.getByText('12').className).toContain('line-through');
  });

  it('連線正常 → 沒有中斷提示，數字是正常樣式', () => {
    render();

    expect(screen.queryByText(/連線中斷/)).not.toBeInTheDocument();
    expect(screen.getByText('12').className).not.toContain('line-through');
  });

  /**
   * 五個數字裡只有「待處理檢舉」是要人採取行動的。
   *
   * 每個數字都可點會讓真正該點的那個失去區別。
   */
  it('⭐ 只有待處理檢舉是連結', () => {
    render();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/moderation/reports');
  });

  it('尚未收到第一筆 → 顯示載入骨架而非 0', () => {
    streamState.snapshot = null;
    render();

    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
