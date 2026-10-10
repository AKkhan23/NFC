import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Nfc,
  ScanLine,
  CalendarCheck,
  ShieldCheck,
  Wallet,
  Receipt,
  BarChart3,
  Bell,
  ScrollText,
  Settings,
  LogOut,
  PanelLeft,
  MapPin,
  CalendarDays,
  Zap,
  Contact,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSocketLifecycle } from '../lib/socket';
import { TopBar } from '../components/TopBar';
import { useSwUpdate } from '../features/nfc/useSwUpdate';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

const NAV: { section: string; items: { to: string; label: string; icon: typeof Users; perm?: string; badge?: string }[] }[] = [
  { section: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    section: 'Manage',
    items: [
      { to: '/users', label: 'Users', icon: Users, perm: 'users.read' },
      { to: '/bands', label: 'NFC Bands', icon: Nfc, perm: 'bands.read' },
      { to: '/profiles', label: 'Tap Profiles', icon: Contact, perm: 'users.update' },
      { to: '/my-card', label: 'My Tap Card', icon: Contact },
      { to: '/devices', label: 'Devices', icon: Zap, perm: 'devices.read' },
      { to: '/locations', label: 'Locations', icon: MapPin, perm: 'locations.read' },
    ],
  },
  {
    section: 'Operate',
    items: [
      { to: '/scanner', label: 'NFC Scanner', icon: ScanLine, perm: 'nfc.scan', badge: 'LIVE' },
      { to: '/visitors', label: 'Visitors & Day QR', icon: Users, perm: 'attendance.read' },
      { to: '/attendance', label: 'Attendance', icon: CalendarCheck, perm: 'attendance.read' },
      { to: '/access', label: 'Access Control', icon: ShieldCheck, perm: 'access.read' },
      { to: '/events', label: 'Events', icon: CalendarDays, perm: 'access.read' },
    ],
  },
  {
    section: 'Money',
    items: [
      { to: '/wallet', label: 'Wallet', icon: Wallet, perm: 'wallet.read' },
      { to: '/pos', label: 'Canteen POS', icon: ScanLine, perm: 'nfc.scan' },
      { to: '/transactions', label: 'Transactions', icon: Receipt, perm: 'transactions.read' },
    ],
  },
  {
    section: 'Insight',
    items: [{ to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.read' }],
  },
  {
    section: 'System',
    items: [
      { to: '/billing', label: 'Billing', icon: Receipt },
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/audit', label: 'Audit Logs', icon: ScrollText, perm: 'audit.read' },
      { to: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
    ],
  },
];

function BillingBanner(): JSX.Element | null {
  const { data } = useQuery({
    queryKey: ['billing-status'],
    queryFn: async () => (await api.get('/billing/status')).data.data as {
      status: string; trialEndsAt?: string; graceUntil?: string; periodEnd?: string;
    },
    staleTime: 60000,
    retry: false,
  });
  if (!data) return null;
  const now = Date.now();
  const writable =
    data.status === 'ACTIVE' ||
    data.status === 'TRIALING' ||
    (data.status === 'PAST_DUE' && !!data.graceUntil && new Date(data.graceUntil).getTime() >= now) ||
    (data.status === 'CANCELED' && !!data.periodEnd && new Date(data.periodEnd).getTime() >= now);
  if (writable) return null;
  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 pt-4 sm:px-6 lg:px-8" role="alert">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
        <span>Billing needs attention ({data.status.toLowerCase()}) — adding users, bands and orders is paused. Gates keep scanning.</span>
        <a href="/billing" className="rounded-lg bg-[#D4A853] px-4 py-1.5 font-semibold text-black hover:bg-[#E5BE6B]">Open billing</a>
      </div>
    </div>
  );
}

function SwUpdateBanner(): JSX.Element | null {  const { available, apply } = useSwUpdate();
  if (!available) return null;
  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 pt-4 sm:px-6 lg:px-8" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D4A853]/40 bg-[#D4A853]/10 px-4 py-2.5 text-sm text-[#E5BE6B]">
        <span>A new version is ready — update to get the latest scanner and fixes.</span>
        <button onClick={apply} className="rounded-lg bg-[#D4A853] px-4 py-1.5 font-semibold text-black hover:bg-[#E5BE6B]">
          Update now
        </button>
      </div>
    </div>
  );
}

function Brand({ collapsed }: { collapsed: boolean }): JSX.Element {  return (
    <div className="flex h-16 items-center gap-3 px-4">
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-gradient-to-b from-[#F0D48A] via-[#D4A853] to-[#8F6A2E] shadow-[0_8px_20px_-6px_rgba(212,168,83,0.6)]">
        <Nfc size={18} className="text-[#1A1408]" strokeWidth={2.4} aria-hidden />
        <span className="absolute inset-0 rounded-[11px] ring-1 ring-inset ring-white/30" aria-hidden />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-none">
          <span className="block text-[15px] font-bold tracking-[-0.02em] text-white">
            AirData
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D4A853]/90">
            NFC Intelligence
          </span>
        </span>
      )}
    </div>
  );
}

export function AppLayout(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const logout = useAuthStore((s) => s.logout);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const mobileNav = useUiStore((s) => s.mobileNav);
  const setMobileNav = useUiStore((s) => s.setMobileNav);
  const nav = useNavigate();
  const loc = useLocation();
  useSocketLifecycle();
  void loc;

  const initials = user ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() : '—';

  return (
    <div className="premium-app-bg min-h-screen text-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-[#D4A853] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
      >
        Skip to content
      </a>

      {mobileNav && (
        <button
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}

      {/* ——— Sidebar ——— */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex-col border-r border-white/[0.07] bg-[#0A0A0C]/95 backdrop-blur-xl transition-[width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          'hidden lg:flex',
          collapsed ? 'lg:w-[76px]' : 'lg:w-[272px]',
          mobileNav && 'flex w-[280px]',
        )}
        aria-label="Primary"
      >
        <div className="border-b border-white/[0.06]">
          <Brand collapsed={collapsed && !mobileNav} />
        </div>

        {/* Org strip */}
        {!collapsed && (
          <div className="mx-3 mt-3 hidden items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 lg:flex">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[11px] font-bold text-[#E5BE6B]">
              {(user?.organizationName?.[0] ?? 'N').toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[12.5px] font-semibold text-white">
                {user?.organizationName ?? 'Workspace'}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-emerald-300/90">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-400" aria-hidden />
                System online
              </span>
            </span>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((g) => {
            const items = g.items.filter((i) => !i.perm || hasPerm(i.perm));
            if (items.length === 0) return null;
            return (
              <div key={g.section} className="mb-5 last:mb-0">
                {!collapsed && (
                  <p className="mb-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/30">
                    {g.section}
                  </p>
                )}
                <ul className="space-y-[2px]">
                  {items.map((i) => (
                    <li key={i.to}>
                      <NavLink
                        to={i.to}
                        end={i.to === '/'}
                        onClick={() => setMobileNav(false)}
                        title={collapsed ? i.label : undefined}
                        className={({ isActive }) =>
                          cn(
                            'group relative flex h-10 items-center gap-3 rounded-[10px] px-2.5 text-[13.5px] font-medium transition-all duration-200',
                            collapsed && 'justify-center px-0',
                            isActive
                              ? 'bg-white/[0.07] text-white shadow-[0_1px_0_0_rgba(255,255,255,0.07)_inset]'
                              : 'text-white/55 hover:bg-white/[0.045] hover:text-white',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <span
                                className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-[#F0D48A] to-[#B8893A]"
                                aria-hidden
                              />
                            )}
                            <i.icon
                              size={17}
                              strokeWidth={isActive ? 2.2 : 1.8}
                              aria-hidden
                              className={cn('shrink-0', isActive ? 'text-[#E5BE6B]' : 'text-white/45 group-hover:text-white/80')}
                            />
                            {!collapsed && <span className="min-w-0 flex-1 truncate">{i.label}</span>}
                            {!collapsed && i.badge && (
                              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-px text-[9px] font-bold tracking-[0.1em] text-emerald-300">
                                {i.badge}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-white/[0.06] p-3">
          {!collapsed && user && (
            <div className="mb-2 flex items-center gap-2.5 rounded-xl px-2 py-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E5BE6B] to-[#8F6A2E] text-[12px] font-bold text-black ring-2 ring-white/10">
                {initials}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-semibold text-white">
                  {user.firstName} {user.lastName}
                </span>
                <span className="block truncate text-[11px] capitalize text-white/40">
                  {user.role?.toLowerCase().replace('_', ' ')}
                </span>
              </span>
            </div>
          )}
          <div className={cn('flex gap-1', collapsed && 'flex-col items-center')}>
            <button
              onClick={toggle}
              className="hidden h-9 flex-1 items-center justify-center gap-2 rounded-[10px] text-white/50 transition hover:bg-white/[0.06] hover:text-white lg:flex"
              aria-label="Toggle sidebar"
            >
              <PanelLeft size={16} />
              {!collapsed && <span className="text-[12.5px] font-medium">Collapse</span>}
            </button>
            <button
              onClick={() => {
                logout();
                nav('/login');
              }}
              className={cn(
                'flex h-9 items-center justify-center gap-2 rounded-[10px] text-white/50 transition hover:bg-red-500/10 hover:text-red-300',
                collapsed ? 'w-9' : 'flex-1',
              )}
              aria-label="Logout"
              title="Logout"
            >
              <LogOut size={16} />
              {!collapsed && <span className="text-[12.5px] font-medium lg:hidden xl:inline">Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ——— Main column ——— */}
      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-300', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[272px]')}>
        <TopBar />
        <BillingBanner />
        <SwUpdateBanner />
        <main id="main-content" className="mx-auto w-full max-w-[1360px] flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
          <div className="page-enter">
            <Outlet />
          </div>
        </main>
        <footer className="mx-auto w-full max-w-[1360px] px-4 pb-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4 text-[11.5px] text-white/30">
            <p>
              <span className="font-semibold text-white/50">AirData</span> · Premium NFC Infrastructure
            </p>
            <p className="flex items-center gap-1.5 tabular-nums">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              All systems operational
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
