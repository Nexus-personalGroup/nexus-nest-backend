import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('渲染標題與副標', () => {
    render(<PageHeader title="角色管理" description="管理後台角色" />);

    expect(
      screen.getByRole('heading', { name: '角色管理' }),
    ).toBeInTheDocument();
    expect(screen.getByText('管理後台角色')).toBeInTheDocument();
  });

  it('沒有副標時不渲染空的段落', () => {
    const { container } = render(<PageHeader title="營運總覽" />);

    expect(container.querySelector('p')).toBeNull();
  });

  it('動作區會渲染在標題之後', () => {
    render(
      <PageHeader title="IP 白名單" description="管理允許存取的 IP">
        <button>新增白名單</button>
      </PageHeader>,
    );

    expect(
      screen.getByRole('button', { name: '新增白名單' }),
    ).toBeInTheDocument();
  });

  /**
   * 有無動作區的排版差異收進元件，正是它存在的一半理由。
   *
   * 原本靠各頁自己決定要不要加 flex——`front-users` 沒加、其餘加了，
   * 而那個分歧沒有任何東西擋得住。
   */
  it('⭐ 有動作區才套 justify-between，沒有就維持單欄', () => {
    const { container: withAction } = render(
      <PageHeader title="A">
        <button>動作</button>
      </PageHeader>,
    );
    const { container: withoutAction } = render(<PageHeader title="B" />);

    expect(withAction.querySelector('header')?.className).toContain(
      'justify-between',
    );
    expect(
      withoutAction.querySelector('header')?.className ?? '',
    ).not.toContain('justify-between');
  });
});
