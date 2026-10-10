import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { RequireAuth } from './guards';
import { LoginPage } from '../features/auth/LoginPage';
import { TapPage } from '../features/tap/TapPage';
import { PublicProfilePage } from '../features/profiles/PublicProfilePage';
import { VisitorPassPage } from '../features/visitors/VisitorPassPage';
import { Skeleton } from '../components/ui';

const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ScannerPage = lazy(() => import('../features/nfc/ScannerPage').then((m) => ({ default: m.ScannerPage })));
const UsersPage = lazy(() => import('../features/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const BandsPage = lazy(() => import('../features/bands/BandsPage').then((m) => ({ default: m.BandsPage })));
const BandDetailPage = lazy(() => import('../features/bands/BandDetailPage').then((m) => ({ default: m.BandDetailPage })));
const IssueBandPage = lazy(() => import('../features/bands/IssueBandPage').then((m) => ({ default: m.IssueBandPage })));
const AttendancePage = lazy(() => import('../features/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })));
const AccessPage = lazy(() => import('../features/access/AccessPage').then((m) => ({ default: m.AccessPage })));
const WalletPage = lazy(() => import('../features/wallet/WalletPage').then((m) => ({ default: m.WalletPage })));
const TransactionsPage = lazy(() => import('../features/transactions/TransactionsPage').then((m) => ({ default: m.TransactionsPage })));
const DevicesPage = lazy(() => import('../features/devices/DevicesPage').then((m) => ({ default: m.DevicesPage })));
const LocationsPage = lazy(() => import('../features/locations/LocationsPage').then((m) => ({ default: m.LocationsPage })));
const EventsPage = lazy(() => import('../features/events/EventsPage').then((m) => ({ default: m.EventsPage })));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const AuditPage = lazy(() => import('../features/audit/AuditPage').then((m) => ({ default: m.AuditPage })));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProfilesPage = lazy(() => import('../features/profiles/ProfilesPage').then((m) => ({ default: m.ProfilesPage })));
const MyTapCardPage = lazy(() => import('../features/profiles/MyTapCardPage').then((m) => ({ default: m.MyTapCardPage })));
const PosPage = lazy(() => import('../features/pos/PosPage').then((m) => ({ default: m.PosPage })));
const BillingPage = lazy(() => import('../features/billing/BillingPage').then((m) => ({ default: m.BillingPage })));
const VisitorsPage = lazy(() => import('../features/visitors/VisitorsPage').then((m) => ({ default: m.VisitorsPage })));

function Lazy({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Suspense fallback={<div className="space-y-3 p-6" aria-label="Loading page"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>}>
      {children}
    </Suspense>
  );
}

const l = (el: React.ReactNode) => <Lazy>{el}</Lazy>;

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/t/:token', element: <TapPage /> },
  { path: '/p/:slug', element: <PublicProfilePage /> },
  { path: '/v/:token', element: <VisitorPassPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: l(<DashboardPage />) },
          { path: '/scanner', element: l(<ScannerPage />) },
          { path: '/users', element: l(<UsersPage />) },
          { path: '/bands', element: l(<BandsPage />) },
          { path: '/bands/issue', element: l(<IssueBandPage />) },
          { path: '/bands/:id', element: l(<BandDetailPage />) },
          { path: '/profiles', element: l(<ProfilesPage />) },
          { path: '/my-card', element: l(<MyTapCardPage />) },
          { path: '/devices', element: l(<DevicesPage />) },
          { path: '/locations', element: l(<LocationsPage />) },
          { path: '/attendance', element: l(<AttendancePage />) },
          { path: '/access', element: l(<AccessPage />) },
          { path: '/events', element: l(<EventsPage />) },
          { path: '/wallet', element: l(<WalletPage />) },
          { path: '/pos', element: l(<PosPage />) },
          { path: '/billing', element: l(<BillingPage />) },
          { path: '/visitors', element: l(<VisitorsPage />) },
          { path: '/transactions', element: l(<TransactionsPage />) },
          { path: '/reports', element: l(<ReportsPage />) },
          { path: '/notifications', element: l(<NotificationsPage />) },
          { path: '/audit', element: l(<AuditPage />) },
          { path: '/settings', element: l(<SettingsPage />) },
        ],
      },
    ],
  },
]);
