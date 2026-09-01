import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PermissionsField } from './PermissionsField';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UNASSIGNABLE_GROUP } from '../lib/unassignable-permissions';

const ITEMS = [
  {
    permissionCode: 'BACKEND:ACCOUNT:VIEW',
    name: '後台-管理者帳號-檢視',
    platform: 'BACKEND',
    module: 'ACCOUNT',
    action: 'VIEW',
  },
  {
    permissionCode: 'BACKEND:ACCOUNT:EDIT',
    name: '後台-管理者帳號-編輯',
    platform: 'BACKEND',
    module: 'ACCOUNT',
    action: 'EDIT',
  },
];

const renderField = (value: string[] = []) => {
  const onChange = vi.fn();
  render(
    <TooltipProvider>
      <PermissionsField value={value} onChange={onChange} items={ITEMS} />
    </TooltipProvider>,
  );
  return { onChange };
};

describe('PermissionsField', () => {
  it('⭐ 群組標題顯示中文，不是權限碼片段', () => {
    renderField();

    expect(screen.getByText('後台')).toBeInTheDocument();
    expect(screen.getByText('管理者帳號')).toBeInTheDocument();
    expect(screen.queryByText('BACKEND')).not.toBeInTheDocument();
    expect(screen.queryByText('ACCOUNT')).not.toBeInTheDocument();
  });

  it('⭐ 安全管理以不可指派的形式出現', () => {
    renderField();

    expect(screen.getByText(UNASSIGNABLE_GROUP.module)).toBeInTheDocument();
    expect(screen.getByText(UNASSIGNABLE_GROUP.badge)).toBeInTheDocument();
    for (const item of UNASSIGNABLE_GROUP.items) {
      expect(
        screen.getByRole('checkbox', { name: `${item}（不可指派）` }),
      ).toBeDisabled();
    }
  });

  /**
   * 「disabled 但仍會進表單」是純展示區塊最典型的壞法——disabled 只擋滑鼠，
   * 擋不住程式把值加進去。這裡驗的是 onChange 完全沒有被呼叫。
   */
  it('⭐ 點擊不可指派的項目不會改變 permissionCodes', async () => {
    const { onChange } = renderField();

    for (const item of UNASSIGNABLE_GROUP.items) {
      await userEvent.click(
        screen.getByRole('checkbox', { name: `${item}（不可指派）` }),
      );
    }

    expect(onChange).not.toHaveBeenCalled();
  });

  // 既有行為，本次改動不得弄壞
  it('⭐ 勾 EDIT 會連帶勾 VIEW', async () => {
    const { onChange } = renderField();

    await userEvent.click(
      screen.getByRole('checkbox', { name: '管理者帳號 編輯' }),
    );

    expect(onChange).toHaveBeenCalledWith([
      'BACKEND:ACCOUNT:EDIT',
      'BACKEND:ACCOUNT:VIEW',
    ]);
  });

  it('⭐ EDIT 已勾時 VIEW 鎖定為勾選且 disabled', () => {
    renderField(['BACKEND:ACCOUNT:VIEW', 'BACKEND:ACCOUNT:EDIT']);

    const view = screen.getByRole('checkbox', {
      name: '管理者帳號 檢視（已鎖定）',
    });
    expect(view).toBeDisabled();
    expect(view).toBeChecked();
  });
});
