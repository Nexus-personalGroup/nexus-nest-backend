import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RequireAuth } from '@/components/RequireAuth';
import { RequireRole } from '@/components/RequireRole';
import { Layout } from '@/routes/_layout';
import { LoginPage } from '@/routes/login/page';
import { HomePage } from '@/routes/home/page';
import { MembersPage } from '@/routes/members/page';
import { RolesPage } from '@/routes/roles/page';
import { ReportsPage } from '@/routes/moderation/reports/page';
import { ReportDetailPage } from '@/routes/moderation/report-detail/page';
import { MemberProfilePage } from '@/routes/moderation/member-profile/page';
import { IpWhitelistPage } from '@/routes/security/ip-whitelist/page';
import { IpBlacklistPage } from '@/routes/security/ip-blacklist/page';
import { queryClient } from '@/api/query-client';
import { Toaster } from '@/components/ui/sonner';
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
                <Route path="/members" element={<MembersPage />} />
                <Route path="/roles" element={<RolesPage />} />
                <Route path="/moderation/reports" element={<ReportsPage />} />
                <Route
                  path="/moderation/reports/:reportId"
                  element={<ReportDetailPage />}
                />
                <Route
                  path="/moderation/members/:memberId"
                  element={<MemberProfilePage />}
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
