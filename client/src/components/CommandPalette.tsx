import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Nfc, Plus, ScanLine, Search, UserPlus, FileBarChart, CornerDownLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useDebounced } from '../hooks/hooks';

interface UserHit {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}
interface BandHit {
  _id: string;
  bandId: string;
  nfcUid: string;
  status: string;
}

const COMMANDS = [
  { label: 'Issue Band', hint: 'Create & assign', to: '/bands/issue', icon: Plus },
  { label: 'Scan NFC', hint: 'Open scanner', to: '/scanner', icon: ScanLine },
  { label: 'Add User', hint: 'Invite member', to: '/users', icon: UserPlus },
  { label: 'Generate Report', hint: 'Export insights', to: '/reports', icon: FileBarChart },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 250);
  const nav = useNavigate();

  const users = useQuery({
    queryKey: ['palette-users', debounced],
    queryFn: async () =>
      (await api.get('/users', { params: { search: debounced, pageSize: 5 } })).data.data.items as UserHit[],
    enabled: open && debounced.length >= 2,
  });
  const bands = useQuery({
    queryKey: ['palette-bands', debounced],
    queryFn: async () =>
      (await api.get('/bands', { params: { search: debounced, pageSize: 5 } })).data.data.items as BandHit[],
    enabled: open && debounced.length >= 2,
  });

  if (!open) return null;

  function go(to: string): void {
    onClose();
    setQ('');
    nav(to);
  }

  const cmds = COMMANDS.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
    >
      <div
        className="mx-auto w-full max-w-[560px] animate-fade-up overflow-hidden rounded-2xl border border-white/[0.1] bg-[#101013]/95 shadow-[0_32px_80px_-16px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
          <Search size={16} className="shrink-0 text-[#D4A853]" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search users, bands, UIDs… or type a command"
            className="w-full bg-transparent py-4 text-[14px] text-white outline-none placeholder:text-white/30"
            aria-label="Global search"
          />
          <kbd className="flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] font-semibold text-white/45">
            ESC
          </kbd>
        </div>
        <div className="max-h-[380px] overflow-y-auto p-2.5">
          {cmds.length > 0 && (
            <div className="mb-1">
              <p className="px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
                Commands
              </p>
              {cmds.map((c) => (
                <button
                  key={c.label}
                  onClick={() => go(c.to)}
                  className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-white/[0.06]"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/60 group-hover:border-[#D4A853]/30 group-hover:text-[#E5BE6B]">
                    <c.icon size={15} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-white">{c.label}</span>
                    <span className="block text-[11.5px] text-white/35">{c.hint}</span>
                  </span>
                  <CornerDownLeft size={13} className="text-white/25" aria-hidden />
                </button>
              ))}
            </div>
          )}
          {debounced.length >= 2 && (
            <>
              <p className="px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
                Users
              </p>
              {(users.data ?? []).map((u) => (
                <button
                  key={u._id}
                  onClick={() => go('/users')}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-[13.5px] transition hover:bg-white/[0.06]"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-white/15 to-white/5 text-[11px] font-bold text-white">
                    {u.firstName[0]}
                    {u.lastName[0]}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-white">
                    {u.firstName} {u.lastName}{' '}
                    <span className="font-normal text-white/35">{u.email}</span>
                  </span>
                </button>
              ))}
              <p className="px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
                Bands
              </p>
              {(bands.data ?? []).map((b) => (
                <button
                  key={b._id}
                  onClick={() => go(`/bands/${b._id}`)}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-white/[0.06]"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-[#D4A853]/20 bg-[#D4A853]/[0.08] text-[#E5BE6B]">
                    <Nfc size={15} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[13px] font-medium text-white">{b.bandId}</span>
                    <span className="block font-mono text-[11.5px] text-white/35">
                      {b.nfcUid} · {b.status}
                    </span>
                  </span>
                </button>
              ))}
              {users.isPending || bands.isPending ? (
                <p className="px-2.5 py-3 text-xs text-white/35">Searching…</p>
              ) : null}
            </>
          )}
          {q === '' && (
            <p className="px-2.5 py-3 text-xs leading-relaxed text-white/30">
              Try “Issue Band”, a name, a band ID, or an NFC UID.
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-white/[0.07] bg-white/[0.015] px-4 py-2.5 text-[11px] text-white/35">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/10 bg-white/[0.05] px-1">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/10 bg-white/[0.05] px-1">↵</kbd> select
          </span>
          <span className="ml-auto font-medium text-[#D4A853]/70">AirData Search</span>
        </div>
      </div>
    </div>
  );
}
