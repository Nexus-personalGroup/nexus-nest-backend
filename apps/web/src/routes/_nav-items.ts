import {
  Flag,
  Home,
  LayoutDashboard,
  MessagesSquare,
  Shield,
  LockKeyhole,
  ShieldBan,
  ShieldCheck,
  UserRound,
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
 * - **首頁的快速入口也讀這一份**，不另外維護（見 routes/home/page.tsx）
 *
 * **分組依「管理的對象是誰」，不依「屬於哪個系統」。**
 * 後台管理員（`/members`）與前台會員（`/front-users`）是兩個獨立的帳號體系，
 * 曾經同處一個「使用者與權限」群組、靠標籤前綴區分（「會員管理」vs「前台會員」）。
 * 那不夠：兩個標籤都以「會員」結尾，掃過去要停下來讀完才分得出來，
 * 而**靠讀者仔細讀標籤的設計遲早會被讀錯**——讀錯的後果是在錯的體系裡找人，
 * 然後以為那個人不存在。
 *
 * 「管理者 / 會員」說的是**是誰**，「後台 / 前台」說的是**在哪個系統**。
 * 操作者當下要判斷的是前者。
 */
export const NAV_ITEMS: NavItem[] = [
  // 無 group → 獨立排在最上方
  { label: '首頁', path: '/', icon: Home },

  // 管理者與權限——後台自己人。不加「管理」二字：其他組都是「X 管理」的
  // 偏正結構，這組是「A 與 B」的並列，再加會變成「管理者與權限管理」
  {
    label: '管理者帳號',
    path: '/members',
    icon: Users,
    group: '管理者與權限',
    requiredPermission: 'BACKEND:ACCOUNT:VIEW',
  },
  {
    // 角色權限歸在這一組而非獨立：RBAC **只作用於後台帳號**，
    // 前台會員沒有角色的概念。這個歸屬本身在說明一件容易誤解的事
    label: '角色權限',
    path: '/roles',
    icon: Shield,
    group: '管理者與權限',
    requiredPermission: 'BACKEND:ROLE:VIEW',
  },

  // 會員管理——前台的人。與上面那組分開是本檔頭註解說的那件事
  {
    label: '會員列表',
    path: '/front-users',
    icon: UserRound,
    group: '會員管理',
    requiredPermission: 'BACKEND:FRONT_USER:VIEW',
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

  // 安全管理（SUPERADMIN-only）
  {
    label: 'IP 白名單',
    path: '/security/ip-whitelist',
    icon: ShieldCheck,
    group: '安全管理',
    requiredRoleCode: ROLE_CODE.SUPERADMIN,
  },
  {
    label: 'IP 黑名單',
    path: '/security/ip-blacklist',
    icon: ShieldBan,
    group: '安全管理',
    requiredRoleCode: ROLE_CODE.SUPERADMIN,
  },
  {
    label: '帳號鎖定',
    path: '/security/account-locks',
    icon: LockKeyhole,
    group: '安全管理',
    requiredRoleCode: ROLE_CODE.SUPERADMIN,
  },
];
