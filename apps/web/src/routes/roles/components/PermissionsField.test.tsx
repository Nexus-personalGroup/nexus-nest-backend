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
    expect(screen.getByText(UNASSIGNABLE_GROUP.note)).toBeInTheDocument();
    for (const item of UNASSIGNABLE_GROUP.items) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  /**
   * **這一區不得有 checkbox。**
   *
   * 取代了原本的「三項皆 disabled」與「點擊不改變 permissionCodes」兩支——
   * 沒有 checkbox 就不可能被點、不可能有值進表單，連「disabled 但程式仍把值加進去」
   * 都一併排除，是更強的保證。
   *
   * 它同時是本次 bug 的回歸測試：恆為未勾的方框對**超級管理者**是假的
   * （那個角色恰恰做得到這三件事），而檢視既有角色時就會顯形。
   */
  it('⭐ 安全管理不得貢獻任何 checkbox——方框會宣稱一個不存在的授予狀態', () => {
    // 模擬超級管理者：所有可指派的權限都已授予
    renderField(ITEMS.map((i) => i.permissionCode));

    // ITEMS 只有 ACCOUNT 一組（VIEW + EDIT），整張表因此應該剛好兩個方框。
    // 多出來的必然來自安全管理區塊——不依賴 DOM 結構，改版面或改名都不會誤判
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    // 確認該區塊確實有渲染，否則上面那條會因為「整塊不見了」而假性通過
    expect(screen.getByText(UNASSIGNABLE_GROUP.module)).toBeInTheDocument();
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
