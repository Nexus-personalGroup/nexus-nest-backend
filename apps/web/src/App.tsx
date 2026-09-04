import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RequireAuth } from '@/components/RequireAuth';
import { RequirePermission } from '@/components/RequirePermission';
import { RequireRole } from '@/components/RequireRole';
import { Layout } from '@/routes/_layout';
import { LoginPage } from '@/routes/login/page';
import { HomePage } from '@/routes/home/page';
import { MembersPage } from '@/routes/members/page';
import { FrontUsersPage } from '@/routes/front-users/page';
import { FrontUserDetailPage } from '@/routes/front-users/detail/page';
import { RolesPage } from '@/routes/roles/page';
import { ReportsPage } from '@/routes/moderation/reports/page';
import { ReportDetailPage } from '@/routes/moderation/report-detail/page';
import { MemberProfilePage } from '@/routes/moderation/member-profile/page';
import { RoomsPage } from '@/routes/moderation/rooms/page';
import { DashboardPage } from '@/routes/moderation/dashboard/page';
import { RoomDetailPage } from '@/routes/moderation/room-detail/page';
import { IpWhitelistPage } from '@/routes/security/ip-whitelist/page';
import { AccountLocksPage } from '@/routes/security/account-locks/page';
import { IpBlacklistPage } from '@/routes/security/ip-blacklist/page';
import { queryClient } from '@/api/query-client';
import { Toaster } from '@/components/ui/sonner';
import { PERMISSION_CODE } from '@/lib/permission-codes';
import { ROLE_CODE } from '@/lib/role-codes';

const TooltipProvider = TooltipPrimitive.Provider;

export const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<HomePage />} />
                <Route
                  path="/members"
                  element={
                    <RequirePermission code={PERMISSION_CODE.ACCOUNT_VIEW}>
                      <MembersPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/front-users"
                  element={
                    <RequirePermission code={PERMISSION_CODE.FRONT_USER_VIEW}>
                      <FrontUsersPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/front-users/:userId"
                  element={
                    <RequirePermission code={PERMISSION_CODE.FRONT_USER_VIEW}>
                      <FrontUserDetailPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/roles"
                  element={
                    <RequirePermission code={PERMISSION_CODE.ROLE_VIEW}>
                      <RolesPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/moderation/reports"
                  element={
                    <RequirePermission code={PERMISSION_CODE.MODERATION_VIEW}>
                      <ReportsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/moderation/reports/:reportId"
                  element={
                    <RequirePermission code={PERMISSION_CODE.MODERATION_VIEW}>
                      <ReportDetailPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/moderation/members/:memberId"
                  element={
                    <RequirePermission code={PERMISSION_CODE.MODERATION_VIEW}>
                      <MemberProfilePage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/moderation/dashboard"
                  element={
                    <RequirePermission code={PERMISSION_CODE.MODERATION_VIEW}>
                      <DashboardPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/moderation/rooms"
                  element={
                    <RequirePermission code={PERMISSION_CODE.MODERATION_VIEW}>
                      <RoomsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/moderation/rooms/:roomId"
                  element={
                    <RequirePermission code={PERMISSION_CODE.MODERATION_VIEW}>
                      <RoomDetailPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/security/ip-whitelist"
                  element={
                    <RequireRole roleCode={ROLE_CODE.SUPERADMIN}>
                      <IpWhitelistPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/security/ip-blacklist"
                  element={
                    <RequireRole roleCode={ROLE_CODE.SUPERADMIN}>
                      <IpBlacklistPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/security/account-locks"
                  element={
                    <RequireRole roleCode={ROLE_CODE.SUPERADMIN}>
                      <AccountLocksPage />
                    </RequireRole>
                  }
                />
              </Route>
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
        <Toaster richColors closeButton />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ErrorBoundary>
  );
};
