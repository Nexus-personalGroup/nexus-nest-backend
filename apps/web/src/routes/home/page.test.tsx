import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const useApiQuery = vi.fn();
const useHasPermission = vi.fn();

vi.mock('@/api/client', () => ({
  useApiQuery: (...args: unknown[]) => useApiQuery(...args),
}));
vi.mock('@/lib/use-has-permission', () => ({
  useHasPermission: (...args: unknown[]) => useHasPermission(...args),
}));

const { HomePage } = await import('./page');

const ME = {
  member: '超級管理者',
  email: 'admin@test.com',
  roleName: '超級管理者',
};

const SNAPSHOT = {
  onlineMembers: 3,
  pendingReports: 1,
  messagesToday: 42,
  generatedAt: '2026-09-01T15:24:00.000Z',
};

/** 依路徑回不同的 query 結果——首頁同時打 /me 與 /moderation/dashboard */
const stubQueries = (snapshot: object | null) => {
  useApiQuery.mockImplementation((_method: string, path: string) =>
    path === '/me'
      ? { data: ME, isLoading: false, error: null }
      : { data: snapshot, isLoading: false, error: null },
  );
};

const renderHome = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );

/**
 * 首頁的權限行為。
 *
 * **這組取代了原本規劃的人工步驟**（用兩種權限的帳號各登入一次看畫面）：
 * seed 只有一個 SUPERADMIN，要驗低權限得先開帳號、設角色、再登入一次，
 * 而那個流程每次驗證都要重跑。寫成測試之後它每次 `pnpm test` 都跑。
 */
describe('HomePage', () => {
  it('⭐ 有 MODERATION:VIEW → 顯示營運概況', () => {
    useHasPermission.mockReturnValue(true);
    stubQueries(SNAPSHOT);

    renderHome();

    expect(screen.getByText('營運概況')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  /**
   * 首頁對所有登入者開放，因此不能假設看得到營運數字。
   * **整塊不渲染**而非顯示「無權限」或空數字——導覽與資訊揭露用隱藏。
   */
  it('⭐ 沒有 MODERATION:VIEW → 營運概況整塊不渲染', () => {
    useHasPermission.mockReturnValue(false);
    stubQueries(null);

    renderHome();

    expect(screen.queryByText('營運概況')).not.toBeInTheDocument();
  });

  it('⭐ 沒有權限時不出現「無權限」字樣或空數字卡', () => {
    useHasPermission.mockReturnValue(false);
    stubQueries(null);

    const { container } = renderHome();

    expect(screen.queryByText(/無權限|沒有權限/)).not.toBeInTheDocument();
    // 空數字卡的症狀是畫面上出現孤零零的 0
    expect(container.textContent).not.toMatch(/線上會員|待處理檢舉|今日訊息/);
  });

  it('沒有權限時個人資料仍然可用', () => {
    useHasPermission.mockReturnValue(false);
    stubQueries(null);

    renderHome();

    expect(screen.getByText('個人資料')).toBeInTheDocument();
    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
  });

  // Sidebar 常駐且不可收起，首頁再列一次是純粹的重複
  it('⭐ 不列出與 Sidebar 重複的功能入口', () => {
    useHasPermission.mockReturnValue(true);
    stubQueries(SNAPSHOT);

    renderHome();

    expect(screen.queryByText('功能入口')).not.toBeInTheDocument();
    expect(screen.queryByText('管理者帳號')).not.toBeInTheDocument();
    expect(screen.queryByText('會員列表')).not.toBeInTheDocument();
  });

  /**
   * 首頁的數字是一次性快照、不會自動更新，所以相對時間會騙人
   * （頁面開著不動，「剛剛」會一直是「剛剛」）。日期也要在——
   * 只有時分的話跨日之後會被當成今天的。
   */
  it('⭐ 快照時間是絕對時間且含日期', () => {
    useHasPermission.mockReturnValue(true);
    stubQueries(SNAPSHOT);

    renderHome();

    const label = screen.getByText(/資料時間/);
    expect(label.textContent).toMatch(/\d+\/\d+/);
    expect(label.textContent).not.toMatch(/剛剛|分鐘前|小時前/);
  });
});
