import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ModerationLinkCard } from './ModerationLinkCard';

const renderCard = (canViewModeration: boolean) =>
  render(
    <MemoryRouter>
      <ModerationLinkCard
        userId="user-1"
        canViewModeration={canViewModeration}
      />
    </MemoryRouter>,
  );

describe('ModerationLinkCard', () => {
  it('有審閱權限 → 顯示連往成員概覽的連結', () => {
    renderCard(true);

    const link = screen.getByRole('link', { name: /查看審閱紀錄/ });
    expect(link).toHaveAttribute('href', '/moderation/members/user-1');
  });

  /**
   * 導覽與動作的規則相反：動作停用並說明理由，導覽直接隱藏——
   * 點進去只會得到一個無權限畫面。
   */
  it('⭐ 沒有審閱權限 → 整張卡片都不出現', () => {
    renderCard(false);

    expect(
      screen.queryByRole('link', { name: /查看審閱紀錄/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('聊天行為')).not.toBeInTheDocument();
  });
});
