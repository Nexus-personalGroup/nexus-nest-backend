import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequireRole } from './RequireRole';
import { ROLE_CODE } from '@/lib/role-codes';
import { useCurrentMember } from '@/lib/use-current-member';

vi.mock('@/lib/use-current-member', () => ({
  useCurrentMember: vi.fn(),
}));

const mockUseCurrentMember = vi.mocked(useCurrentMember);

const Protected = () => <div>受保護的內容</div>;

const renderGuard = () =>
  render(
    <RequireRole roleCode={ROLE_CODE.SUPERADMIN}>
      <Protected />
    </RequireRole>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RequireRole', () => {
  it('角色相符 → 渲染內容', () => {
    mockUseCurrentMember.mockReturnValue({
      roleCode: ROLE_CODE.SUPERADMIN,
      isLoading: false,
    } as never);

    renderGuard();

    expect(screen.getByText('受保護的內容')).toBeInTheDocument();
  });

  /**
   * 這條是本次的行為變更：原本是靜默導回首頁。
   *
   * 與 RequirePermission 保持同一種表現——兩種「沒權限」行為並存
   * 比任何一種單獨存在都糟，下一個人要先查才知道用哪個。
   */
  it('⭐ 角色不符 → 顯示訊息而非導頁，且不渲染內容', () => {
    mockUseCurrentMember.mockReturnValue({
      roleCode: 'ADMIN',
      isLoading: false,
    } as never);

    renderGuard();

    expect(screen.getByText('沒有存取權限')).toBeInTheDocument();
    expect(screen.queryByText('受保護的內容')).not.toBeInTheDocument();
  });

  it('載入中 → 內容與訊息都不渲染', () => {
    mockUseCurrentMember.mockReturnValue({
      roleCode: undefined,
      isLoading: true,
    } as never);

    renderGuard();

    expect(screen.queryByText('受保護的內容')).not.toBeInTheDocument();
    expect(screen.queryByText('沒有存取權限')).not.toBeInTheDocument();
  });
});
