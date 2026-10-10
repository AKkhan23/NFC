import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Menu, Search, Command } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { CommandPalette } from './CommandPalette';
import { useUnreadCount } from '../features/notifications/NotificationsPage';

export function TopBar(): JSX.Element {
  const [palette, setPalette] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '?';
  const { data: unread } = useUnreadCount();
  const setMobileNav = useUiStore((s) => s.setMobileNav);

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#060607]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1360px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => setMobileNav(true)}
          className="grid h-9 w-9 place-items-center rounded-[10px] text-white/60 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>

        {/* Search */}
        <button
          onClick={() => setPalette(true)}
          className="group flex h-10 flex-1 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 text-[13.5px] text-white/35 transition hover:border-white/[0.15] hover:bg-white/[0.05] sm:max-w-[380px]"
          aria-label="Global search (Ctrl+K)"
        >
          <Search size={15} aria-hidden className="shrink-0 text-white/40 group-hover:text-[#E5BE6B]" />
          <span className="hidden truncate sm:inline">Search users, bands, UIDs…</span>
          <span className="inline truncate sm:hidden">Search…</span>
          <kbd className="ml-auto hidden shrink-0 items-center gap-1 rounded-md border border-white/[0.09] bg-white/[0.04] px-1.5 py-0.5 text-[10.5px] font-semibold text-white/45 sm:flex">
            <Command size={10} aria-hidden /> K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Live clock badge */}
          <span className="mr-1 hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11.5px] font-medium text-white/55 md:flex">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-400" aria-hidden />
            Live sync
          </span>

          <Link
            to="/notifications"
            className="relative grid h-9 w-9 place-items-center rounded-[10px] text-white/60 transition hover:bg-white/[0.06] hover:text-white"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          >
            <Bell size={17} />
            {unread ? (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gradient-to-b from-[#F0D48A] to-[#B8893A] px-1 text-[9.5px] font-bold tabular-nums text-black ring-2 ring-[#060607]">
                {unread > 9 ? '9+' : unread}
              </span>
            ) : null}
          </Link>

          <span className="mx-1 hidden h-6 w-px bg-white/[0.08] sm:block" aria-hidden />

          <span className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition hover:bg-white/[0.04]">
            <span
              className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#F0D48A] via-[#D4A853] to-[#8F6A2E] text-[11px] font-bold text-black ring-2 ring-white/10"
              title={user ? `${user.firstName} ${user.lastName}` : ''}
            >
              {initials}
            </span>
            <span className="hidden text-left leading-tight xl:block">
              <span className="block max-w-[140px] truncate text-[12.5px] font-semibold text-white">
                {user ? `${user.firstName} ${user.lastName}` : '—'}
              </span>
              <span className="block text-[10.5px] capitalize text-white/40">
                {user?.role?.toLowerCase().replace('_', ' ') ?? ''}
              </span>
            </span>
          </span>
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </header>
  );
}
