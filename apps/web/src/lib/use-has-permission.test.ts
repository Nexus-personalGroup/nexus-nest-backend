import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHasPermission } from './use-has-permission';
import { useCurrentMember } from './use-current-member';

vi.mock('./use-current-member', () => ({
  useCurrentMember: vi.fn(),
}));

const mockUseCurrentMember = vi.mocked(useCurrentMember);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useHasPermission', () => {
  it('具該權限 → true', () => {
    mockUseCurrentMember.mockReturnValue({
      permissions: ['BACKEND:ACCOUNT:VIEW'],
    } as never);
    const { result } = renderHook(() =>
      useHasPermission('BACKEND:ACCOUNT:VIEW'),
    );
    expect(result.current).toBe(true);
  });

  it('缺該權限 → false', () => {
    mockUseCurrentMember.mockReturnValue({
      permissions: ['BACKEND:ROLE:VIEW'],
    } as never);
    const { result } = renderHook(() =>
      useHasPermission('BACKEND:ACCOUNT:VIEW'),
    );
    expect(result.current).toBe(false);
  });

  it('無權限清單 → false', () => {
    mockUseCurrentMember.mockReturnValue({ permissions: [] } as never);
    const { result } = renderHook(() => useHasPermission('ANYTHING'));
    expect(result.current).toBe(false);
  });
});
