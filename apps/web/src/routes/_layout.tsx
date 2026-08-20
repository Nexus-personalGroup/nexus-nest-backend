import { useMemo } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { tokenStorage } from '@/lib/storage';
import { useCurrentMember } from '@/lib/use-current-member';
import { NAV_ITEMS, type NavItem } from './_nav-items';

const UNGROUPED_KEY = '__ungrouped__';

/**
 * 把 visible items 依 group 分塊；維持 NAV_ITEMS 原本宣告順序
 * 無 group 的（group === undefined）歸到 UNGROUPED_KEY，固定渲染在最上
 */
const groupNavItems = (
  items: NavItem[],
): Array<{ groupKey: string; label: string | null; items: NavItem[] }> => {
  const order: string[] = [];
  const byGroup = new Map<string, NavItem[]>();
  for (const item of items) {
    const key = item.group ?? UNGROUPED_KEY;
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)!.push(item);
  }
  return order.map((key) => ({
    groupKey: key,
    label: key === UNGROUPED_KEY ? null : key,
    items: byGroup.get(key)!,
  }));
};

// 後台共用 layout：左側 Sidebar、右側 main，登入後所有頁面共用
export const Layout = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { permissions, roleCode } = useCurrentMember();

  const handleLogout = () => {
    tokenStorage.clear();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  // 過濾邏輯：requiredPermission + requiredRoleCode 兩個門檻都要通過
  const visibleNavItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (
          item.requiredPermission &&
          !permissions.includes(item.requiredPermission)
        ) {
          return false;
        }
        if (item.requiredRoleCode && item.requiredRoleCode !== roleCode) {
          return false;
        }
        return true;
      }),
    [permissions, roleCode],
  );

  const groupedNavItems = useMemo(
    () => groupNavItems(visibleNavItems),
    [visibleNavItems],
  );

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="px-2 py-1 text-sm font-semibold">管理後台</div>
        </SidebarHeader>
        <SidebarContent>
          {groupedNavItems.map((group) => (
            <SidebarGroup key={group.groupKey}>
              {group.label ? (
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              ) : null}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <NavLink to={item.path} end>
                        {({ isActive }) => (
                          <SidebarMenuButton isActive={isActive}>
                            <item.icon />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        )}
                      </NavLink>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout}>
                <LogOut />
                <span>登出</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};
