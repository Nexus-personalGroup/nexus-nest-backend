import {
  Flag,
  Home,
  LayoutDashboard,
  MessagesSquare,
  Shield,
  ShieldBan,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { ROLE_CODE, type RoleCode } from '@/lib/role-codes';

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  /** 屬於哪個 sidebar group（如「使用者與權限」「安全」）；未指定為「無 group」固定放最上 */
  group?: string;
  /** 需要的權限代碼；undefined 表示所有登入者都看得到 */
  requiredPermission?: string;
  /** 粗粒度 role gate（與 requiredPermission 並用，兩者皆通才顯示） */
  requiredRoleCode?: RoleCode;
};

/**
 * Sidebar 導航項目宣告。新增模組時加一筆即可：
 * - Layout 會依 requiredPermission + requiredRoleCode 過濾可見項目
 * - 依 group 分塊渲染（整組空就不渲染整個 group）
 */
export const NAV_ITEMS: NavItem[] = [
  // 無 group → 獨立排在最上方
  { label: '首頁', path: '/', icon: Home },

  // 使用者與權限
  {
    label: '會員管理',
    path: '/members',
    icon: Users,
    group: '使用者與權限',
    requiredPermission: 'BACKEND:ACCOUNT:VIEW',
  },
  {
    label: '角色管理',
    path: '/roles',
    icon: Shield,
    group: '使用者與權限',
    requiredPermission: 'BACKEND:ROLE:VIEW',
  },

  // 聊天管理
  {
    label: '營運總覽',
    path: '/moderation/dashboard',
    icon: LayoutDashboard,
    group: '聊天管理',
    requiredPermission: 'BACKEND:MODERATION:VIEW',
  },
  {
    label: '檢舉審閱',
    path: '/moderation/reports',
    icon: Flag,
    group: '聊天管理',
    requiredPermission: 'BACKEND:MODERATION:VIEW',
  },

  {
    label: '聊天室',
    path: '/moderation/rooms',
    icon: MessagesSquare,
    group: '聊天管理',
    requiredPermission: 'BACKEND:MODERATION:VIEW',
  },

  // 安全（SUPERADMIN-only）
  {
    label: 'IP 白名單',
    path: '/security/ip-whitelist',
    icon: ShieldCheck,
    group: '安全',
    requiredRoleCode: ROLE_CODE.SUPERADMIN,
  },
  {
    label: 'IP 黑名單',
    path: '/security/ip-blacklist',
    icon: ShieldBan,
    group: '安全',
    requiredRoleCode: ROLE_CODE.SUPERADMIN,
  },
];
