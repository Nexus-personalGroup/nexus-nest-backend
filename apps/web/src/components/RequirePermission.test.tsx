import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequirePermission } from './RequirePermission';
import { PERMISSION_CODE } from '@/lib/permission-codes';
import { useCurrentMember } from '@/lib/use-current-member';

vi.mock('@/lib/use-current-member', () => ({
  useCurrentMember: vi.fn(),
}));

const mockUseCurrentMember = vi.mocked(useCurrentMember);

const Protected = () => <div>受保護的內容</div>;

const renderGuard = () =>
  render(
    <RequirePermission code={PERMISSION_CODE.ROLE_VIEW}>
      <Protected />
    </RequirePermission>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RequirePermission', () => {
  it('具該權限 → 渲染內容', () => {
    mockUseCurrentMember.mockReturnValue({
      permissions: [PERMISSION_CODE.ROLE_VIEW],
      isLoading: false,
    } as never);

    renderGuard();

    expect(screen.getByText('受保護的內容')).toBeInTheDocument();
  });

  /**
   * 兩個斷言缺一不可。
   *
   * 只斷言「有顯示訊息」的話，一個「永遠渲染內容、額外附上訊息」的實作也會綠
   * ——而那等於沒有守衛。
   */
  it('⭐ 缺該權限 → 顯示訊息，且不渲染內容', () => {
    mockUseCurrentMember.mockReturnValue({
      permissions: [PERMISSION_CODE.ACCOUNT_VIEW],
      isLoading: false,
    } as never);

    renderGuard();

    expect(screen.getByText('沒有存取權限')).toBeInTheDocument();
    expect(screen.queryByText('受保護的內容')).not.toBeInTheDocument();
  });

  it('缺該權限 → 標出缺少的權限碼（使用者才說得出自己要什麼）', () => {
    mockUseCurrentMember.mockReturnValue({
      permissions: [],
      isLoading: false,
    } as never);

    renderGuard();

    expect(screen.getByText(PERMISSION_CODE.ROLE_VIEW)).toBeInTheDocument();
  });

  // 載入中就渲染的話，有權限的人會先閃一下「沒有存取權限」
  it('⭐ 載入中 → 內容與訊息都不渲染', () => {
    mockUseCurrentMember.mockReturnValue({
      permissions: [],
      isLoading: true,
    } as never);

    renderGuard();

    expect(screen.queryByText('受保護的內容')).not.toBeInTheDocument();
    expect(screen.queryByText('沒有存取權限')).not.toBeInTheDocument();
  });
});
