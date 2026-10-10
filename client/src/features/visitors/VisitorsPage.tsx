import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Copy, QrCode, ScanLine, TicketPlus, UserRound } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';
import { Badge, Button, Card, Field, Input, PageHeader, useConfirm } from '../../components/ui';
import { cn } from '../../lib/utils';

interface PassRow {
  _id: string;
  kind: string;
  name: string;
  purpose?: string;
  maxUses: number;
  usedCount: number;
  status: string;
  createdAt: string;
  validTo?: string;
}

interface PassDetail extends PassRow {
  token: string;
  checkinUrl?: string;
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'USED' | 'CLOSED';

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function passLink(pass: { token: string; checkinUrl?: string }): string {
  // checkinUrl is relative ("/v/<token>"); derive from the token so a missing
  // field can never produce a "…/undefined" QR.
  const path = pass.checkinUrl && pass.checkinUrl !== 'undefined' ? pass.checkinUrl : `/v/${pass.token}`;
  return `${window.location.origin}${path}`;
}

export function VisitorsPage(): JSX.Element {
  const qc = useQueryClient();
  const { ask, dialog } = useConfirm();
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [kind, setKind] = useState('VISITOR');
  const [token, setToken] = useState('');
  const [issued, setIssued] = useState<PassDetail | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['visitors'],
    queryFn: async () => (await api.get('/visitors', { params: { pageSize: 50 } })).data.data as { items: PassRow[] },
  });

  const create = useMutation({
    mutationFn: async () => (await api.post('/visitors', { kind, name: name.trim(), purpose: purpose.trim() || undefined })).data.data as PassDetail,
    onSuccess: (d) => {
      setIssued(d);
      setName('');
      setPurpose('');
      qc.invalidateQueries({ queryKey: ['visitors'] });
    },
  });

  const checkin = useMutation({
    mutationFn: async () => (await api.post('/visitors/check-in', { token: token.trim() })).data.data as { pass: PassRow },
    onSuccess: () => {
      setToken('');
      qc.invalidateQueries({ queryKey: ['visitors'] });
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => (await api.post(`/visitors/${id}/revoke`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visitors'] }),
  });

  async function askRevoke(p: PassRow): Promise<void> {
    if (!(await ask({ title: `Revoke ${p.name}'s pass?`, body: 'The QR stops working immediately. This cannot be undone.', danger: true, confirmLabel: 'Revoke pass' }))) return;
    revoke.mutate(p._id);
  }

  async function copy(text: string, which: string): Promise<void> {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  const items = useMemo(() => {
    const all = list.data?.items ?? [];
    if (filter === 'ALL') return all;
    if (filter === 'ACTIVE') return all.filter((p) => p.status === 'ACTIVE' && p.usedCount < p.maxUses);
    if (filter === 'USED') return all.filter((p) => p.usedCount >= p.maxUses);
    return all.filter((p) => p.status !== 'ACTIVE');
  }, [list.data, filter]);

  const activeToday = useMemo(
    () => (list.data?.items ?? []).filter((p) => p.status === 'ACTIVE').length,
    [list.data],
  );
  const checkedIn = useMemo(
    () => (list.data?.items ?? []).reduce((s, p) => s + Math.min(p.usedCount, p.maxUses), 0),
    [list.data],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader title="Visitors & Day QR" subtitle="Gate passes for visitors — and day QR codes for holders who forgot their band." />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active passes" value={String(activeToday)} tone="gold" />
        <StatCard label="Check-ins today" value={String(checkedIn)} tone="green" />
        <StatCard label="Total issued" value={String(list.data?.items.length ?? 0)} tone="neutral" />
        <StatCard label="Gate link" value="/v/:token" tone="neutral" mono />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Issue */}
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <TicketPlus size={17} className="text-[#E5BE6B]" aria-hidden />
            <h2 className="font-semibold">Issue pass</h2>
            <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/50">valid today</span>
          </div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pass kind">
            {([
              { id: 'VISITOR', title: 'Visitor', desc: 'Guests, parents, vendors', icon: UserRound },
              { id: 'DAY_QR', title: 'Day QR', desc: 'Forgot band? temporary code', icon: QrCode },
            ]).map((k) => (
              <button
                key={k.id}
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => setKind(k.id)}
                className={cn(
                  'rounded-xl border p-3 text-left transition',
                  kind === k.id
                    ? 'border-[#D4A853]/60 bg-[#D4A853]/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20',
                )}
              >
                <k.icon size={17} className={kind === k.id ? 'text-[#E5BE6B]' : 'text-white/45'} aria-hidden />
                <p className="mt-1.5 text-sm font-semibold">{k.title}</p>
                <p className="text-xs text-white/40">{k.desc}</p>
              </button>
            ))}
          </div>
          <Field label="Full name" htmlFor="v-name">
            <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meera Sharma" autoComplete="off" />
          </Field>
          <Field label="Purpose (optional)" htmlFor="v-purpose">
            <Input id="v-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Parent meeting, delivery…" autoComplete="off" />
          </Field>
          {create.isError && <p className="text-sm text-red-400" role="alert">{(create.error as Error).message}</p>}
          <Button variant="gold" className="w-full sm:w-auto" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Issuing…' : 'Issue pass'}
          </Button>

          {issued && (
            <div className="space-y-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4" role="status">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-emerald-200">Pass ready for {issued.name}</p>
                <Badge value={issued.kind} />
              </div>
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <span className="rounded-xl bg-white p-2.5 shadow-lg">
                  <QRCodeSVG value={passLink(issued)} size={152} aria-label="Gate pass QR" />
                </span>
                <div className="w-full min-w-0 flex-1 space-y-2 text-center sm:text-left">
                  <p className="break-all font-mono text-[11px] leading-relaxed text-white/50">{issued.token}</p>
                  <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                    <Button variant="secondary" onClick={() => copy(passLink(issued), 'link')}>
                      <Copy size={13} aria-hidden /> {copied === 'link' ? 'Copied!' : 'Copy link'}
                    </Button>
                    <Button variant="secondary" onClick={() => copy(issued.token, 'code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</Button>
                  </div>
                  <p className="text-xs text-white/40">Show this QR at the gate — it scans straight to verification.</p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Gate check-in */}
        <div className="space-y-5">
          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <ScanLine size={17} className="text-[#E5BE6B]" aria-hidden />
              <h2 className="font-semibold">Gate check-in</h2>
            </div>
            <Field label="Pass code or scan result" htmlFor="v-token" hint="Paste the 64-character code (or type it from the guest's screen)">
              <Input id="v-token" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="Paste code…" className="font-mono !text-xs" autoComplete="off" spellCheck={false} />
            </Field>
            {checkin.isError && <p className="text-sm text-red-400" role="alert">{(checkin.error as Error).message}</p>}
            {checkin.isSuccess && <p className="text-sm text-emerald-300" role="status">Checked in — welcome!</p>}
            <Button variant="gold" className="w-full sm:w-auto" disabled={token.trim().length < 64 || checkin.isPending} onClick={() => checkin.mutate()}>
              {checkin.isPending ? 'Checking…' : 'Check in guest'}
            </Button>
          </Card>

          <Card className="flex items-start gap-3 border-dashed">
            <CalendarClock size={17} className="mt-0.5 shrink-0 text-white/40" aria-hidden />
            <p className="text-[13px] leading-relaxed text-white/50">
              Passes expire at midnight and single-use codes burn on entry. Revoked or expired codes are refused with a reason at the gate — no awkward confrontations.
            </p>
          </Card>
        </div>
      </div>

      {/* Pass register */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Pass register</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter passes">
            {(['ALL', 'ACTIVE', 'USED', 'CLOSED'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition',
                  filter === f ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {f === 'ALL' ? 'All' : f === 'USED' ? 'Used up' : f === 'CLOSED' ? 'Revoked / expired' : 'Active'}
              </button>
            ))}
          </div>
        </div>

        {list.isPending && <p className="text-sm text-muted-foreground">Loading passes…</p>}
        {list.data && items.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
            {filter === 'ALL' ? 'No passes yet — issue the first one above.' : 'Nothing in this view.'}
          </p>
        )}

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Guest</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Uses</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Issued</th>
                <th className="py-2 pl-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((p) => (
                <tr key={p._id} className="transition hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E5BE6B] to-[#8F6A2E] text-[11px] font-bold text-black">{initials(p.name)}</span>
                      <span><span className="block font-medium">{p.name}</span>{p.purpose && <span className="block max-w-48 truncate text-xs text-muted-foreground">{p.purpose}</span>}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.kind === 'DAY_QR' ? 'Day QR' : 'Visitor'}</td>
                  <td className="px-3 py-2.5"><UsesBar used={p.usedCount} max={p.maxUses} /></td>
                  <td className="px-3 py-2.5"><Badge value={p.status} /></td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{timeAgo(p.createdAt)}</td>
                  <td className="py-2.5 pl-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setDetailId(p._id)} className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted">QR</button>
                      {p.status === 'ACTIVE' && <button onClick={() => askRevoke(p)} className="rounded-md border border-red-500/30 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10">Revoke</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="space-y-2 md:hidden">
          {items.map((p) => (
            <li key={p._id} className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E5BE6B] to-[#8F6A2E] text-xs font-bold text-black">{initials(p.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.kind === 'DAY_QR' ? 'Day QR' : 'Visitor'} · {timeAgo(p.createdAt)}</p>
                </div>
                <Badge value={p.status} />
              </div>
              <div className="mt-2"><UsesBar used={p.usedCount} max={p.maxUses} /></div>
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => setDetailId(p._id)} className="flex-1 rounded-md border border-border px-2.5 py-2 text-xs hover:bg-muted">Show QR</button>
                {p.status === 'ACTIVE' && <button onClick={() => askRevoke(p)} className="flex-1 rounded-md border border-red-500/30 px-2.5 py-2 text-xs text-red-400 hover:bg-red-500/10">Revoke</button>}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {detailId && <PassQrModal passId={detailId} onClose={() => setDetailId(null)} />}
      {dialog}
    </div>
  );
}

function UsesBar({ used, max }: { used: number; max: number }): JSX.Element {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-black/10">
        <div className={cn('h-full rounded-full', used >= max ? 'bg-white/30' : 'bg-emerald-400')} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground">{used}/{max}</span>
    </div>
  );
}

function StatCard({ label, value, tone, mono }: { label: string; value: string; tone: 'gold' | 'green' | 'neutral'; mono?: boolean }): JSX.Element {
  return (
    <Card className={cn(
      'relative overflow-hidden !p-4',
      tone === 'gold' && 'border-[#D4A853]/30 bg-[#D4A853]/[0.06]',
      tone === 'green' && 'border-emerald-400/25 bg-emerald-400/[0.05]',
    )}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tracking-tight', mono && 'font-mono !text-lg')}>{value}</p>
    </Card>
  );
}

function PassQrModal({ passId, onClose }: { passId: string; onClose: () => void }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const detail = useQuery({
    queryKey: ['visitor', passId],
    queryFn: async () => (await api.get(`/visitors/${passId}`)).data.data as PassDetail,
  });
  const link = detail.data ? passLink(detail.data) : '';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Pass QR code">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-background p-5 text-center sm:p-6">
        <div className="flex items-start justify-between">
          <div className="text-left">
            <h3 className="font-semibold">{detail.data?.name ?? 'Loading…'}</h3>
            {detail.data && <p className="text-xs text-muted-foreground">Used {detail.data.usedCount}/{detail.data.maxUses} · {detail.data.status}</p>}
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-muted-foreground hover:bg-muted" aria-label="Close">✕</button>
        </div>
        {detail.data && (
          <>
            <span className="mx-auto block w-fit rounded-xl bg-white p-3 shadow-lg">
              <QRCodeSVG value={link} size={200} aria-label="Gate pass QR" />
            </span>
            <p className="break-all font-mono text-[11px] text-muted-foreground">{link}</p>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                navigator.clipboard?.writeText(link).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }).catch(() => undefined);
              }}
            >
              <Copy size={13} aria-hidden /> {copied ? 'Copied!' : 'Copy gate link'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
