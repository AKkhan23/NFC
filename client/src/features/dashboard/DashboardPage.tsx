import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  RefreshCw,
  Nfc,
  Users,
  ScanLine,
  BadgeCheck,
  TrendingUp,
  ArrowUpRight,
  Radio,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useSocketEvent } from '../../lib/socket';
import { useNow } from '../../hooks/hooks';
import { Badge, Card, Skeleton } from '../../components/ui';
import { bucketByHour, useKpiCounts, useTodayScans, type LiveScanEvent, type ScanItem } from './dashboardApi';
import { cn } from '../../lib/utils';

function Kpi({
  label,
  value,
  sub,
  subTone = 'ok',
  loading,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  subTone?: 'ok' | 'warn' | 'neutral';
  loading: boolean;
  icon: typeof Nfc;
  accent: string;
}): JSX.Element {
  return (
    <Card hover className="group relative overflow-hidden p-5">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-[0.12] blur-2xl transition-opacity group-hover:opacity-25"
        style={{ background: accent }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08]"
          style={{ background: `${accent}1A`, color: accent }}
        >
          <Icon size={18} aria-hidden />
        </span>
        <span className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10.5px] font-semibold tabular-nums text-white/50">
          <TrendingUp size={11} className="text-emerald-400" aria-hidden />
          Live
        </span>
      </div>
      <p className="eyebrow mt-4 text-white/35">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-9 w-24" />
      ) : (
        <p className="mt-1 font-mono text-[32px] font-medium leading-none tracking-tight tabular-nums text-white">
          {value}
        </p>
      )}
      <p className="mt-2.5 flex items-center gap-1.5 text-xs text-white/40">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            subTone === 'ok' && 'bg-emerald-400',
            subTone === 'warn' && 'bg-amber-400',
            subTone === 'neutral' && 'bg-white/30',
          )}
          aria-hidden
        />
        {sub}
      </p>
    </Card>
  );
}

function LiveFeed({ seed }: { seed: ScanItem[] }): JSX.Element {
  const [live, setLive] = useState<LiveScanEvent[]>([]);
  useSocketEvent<LiveScanEvent>('nfc.scan', (ev) => setLive((prev) => [ev, ...prev].slice(0, 20)));
  const now = useNow(5000);
  void now;

  const seeded: LiveScanEvent[] = seed.slice(0, 10).map((s) => ({
    scanId: s._id,
    nfcUid: s.nfcUid,
    bandId: null,
    user: null,
    action: s.action,
    result: s.result,
    timestamp: s.timestamp,
  }));
  const items = [...live, ...seeded].slice(0, 12);

  return (
    <Card className="flex h-full min-h-[420px] flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-[14.5px] font-semibold tracking-tight text-white">Live Activity</h2>
          <p className="mt-0.5 text-xs text-white/40">Real-time tap stream</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-400" aria-hidden />
          LIVE
        </span>
      </div>
      {items.length === 0 && (
        <div className="grid flex-1 place-items-center py-10 text-center">
          <div>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-white/30">
              <Radio size={20} aria-hidden />
            </span>
            <p className="mt-3 text-[13.5px] font-medium text-white/70">Awaiting first tap</p>
            <p className="mt-1 text-xs text-white/35">Activity appears here in real time.</p>
          </div>
        </div>
      )}
      <ul className="-mx-1 flex-1 space-y-1.5 overflow-y-auto px-1">
        {items.map((s) => (
          <li
            key={s.scanId + s.timestamp}
            className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition hover:border-white/[0.12] hover:bg-white/[0.04]"
          >
            <span
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border font-mono text-[10px] font-bold',
                s.result === 'SUCCESS'
                  ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                  : 'border-red-400/20 bg-red-400/10 text-red-300',
              )}
              aria-hidden
            >
              {s.result === 'SUCCESS' ? '✓' : '!'}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-white">{s.user ?? s.bandId ?? s.nfcUid}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-white/35">
                {s.nfcUid} · {s.action}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Badge value={s.result} />
              <p className="mt-1 text-[10.5px] tabular-nums text-white/30" title={new Date(s.timestamp).toLocaleString()}>
                {formatDistanceToNow(new Date(s.timestamp), { addSuffix: true })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const PIE_COLORS = ['#34D399', '#F87171', '#E5BE6B', '#71717A'];

const tooltipStyle = {
  backgroundColor: 'rgba(16,16,19,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  fontSize: 12,
  color: '#fff',
};

export function DashboardPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const { bands, activeBands, users, scansToday } = useKpiCounts();
  const todayScans = useTodayScans(200);
  const scans = todayScans.data ?? [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.firstName ?? 'Admin';

  const hourly = bucketByHour(scans);
  const entry = scans.filter((s) => s.action === 'ENTRY').length;
  const exit = scans.filter((s) => s.action === 'EXIT').length;
  const denied = scans.filter((s) => s.result !== 'SUCCESS').length;
  const resultSplit = [
    { name: 'Success', value: scans.length - denied },
    { name: 'Denied', value: scans.filter((s) => s.result === 'DENIED' || s.result === 'BLOCKED').length },
    {
      name: 'Other',
      value: scans.filter((s) => ['UNKNOWN', 'INVALID', 'ERROR', 'LOST', 'EXPIRED'].includes(s.result)).length,
    },
  ].filter((d) => d.value > 0);

  function refresh(): void {
    bands.refetch();
    activeBands.refetch();
    users.refetch();
    scansToday.refetch();
    todayScans.refetch();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-2 text-[#D4A853]">
            <span className="h-px w-6 bg-[#D4A853]/60" aria-hidden />
            Command center
          </p>
          <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-white">
            {greeting},{' '}
            <span className="font-serif italic font-normal gold-text">{firstName}</span>
          </h1>
          <p className="mt-1.5 text-[13.5px] text-white/45">
            Here&apos;s what&apos;s happening across your NFC ecosystem.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/45 sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-400" aria-hidden />
            Synced just now
          </span>
          <button
            onClick={refresh}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-white/[0.09] bg-white/[0.04] px-3.5 text-[13px] font-medium text-white/80 transition hover:border-white/[0.16] hover:bg-white/[0.07]"
          >
            <RefreshCw size={14} aria-hidden /> Refresh
          </button>
        </div>
      </header>

      {/* KPIs — 12-col pixel grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total Bands" value={String(bands.data ?? '—')} sub="Registered in your org" loading={bands.isPending} icon={Nfc} accent="#E5BE6B" />
        <Kpi label="Active Bands" value={String(activeBands.data ?? '—')} sub="Ready to scan" loading={activeBands.isPending} icon={BadgeCheck} accent="#34D399" />
        <Kpi label="Today's Scans" value={String(scansToday.data ?? '—')} sub={denied > 0 ? `${denied} denied` : 'All clear today'} subTone={denied > 0 ? 'warn' : 'ok'} loading={scansToday.isPending} icon={ScanLine} accent="#7DD3FC" />
        <Kpi label="Active Users" value={String(users.data ?? '—')} sub="Across all roles" loading={users.isPending} icon={Users} accent="#C4B5FD" />
      </div>

      {/* Activity + Live */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-1 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[14.5px] font-semibold tracking-tight text-white">NFC Activity</h2>
              <p className="mt-0.5 text-xs text-white/40">Successful vs failed scans by hour · today</p>
            </div>
            <span className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] font-medium tabular-nums text-white/50">
              {(scansToday.data ?? 0).toLocaleString()} taps <ArrowUpRight size={12} className="text-emerald-400" aria-hidden />
            </span>
          </div>
          {todayScans.isPending ? (
            <Skeleton className="mt-3 h-[240px] w-full rounded-xl" />
          ) : (
            <div className="mt-2">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={hourly} margin={{ top: 8, right: 4, bottom: 0, left: -14 }}>
                  <defs>
                    <linearGradient id="gSuccess" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34D399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34D399" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gDenied" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F87171" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#F87171" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="0" vertical={false} />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} interval={5} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} />
                  <Area type="monotone" dataKey="success" name="Successful" stroke="#34D399" strokeWidth={2} fill="url(#gSuccess)" />
                  <Area type="monotone" dataKey="denied" name="Failed" stroke="#F87171" strokeWidth={2} fill="url(#gDenied)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <LiveFeed seed={scans} />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[14.5px] font-semibold tracking-tight text-white">Access Flow</h2>
          <p className="mb-2 mt-0.5 text-xs text-white/40">Entry vs exit scans today</p>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={[{ name: 'Entry', value: entry }, { name: 'Exit', value: exit }]} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="32%">
              <CartesianGrid strokeDasharray="0" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="value" fill="#E5BE6B" radius={[8, 8, 4, 4]} maxBarSize={72} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h2 className="text-[14.5px] font-semibold tracking-tight text-white">Scan Results</h2>
          <p className="mb-2 mt-0.5 text-xs text-white/40">Outcome split for today&apos;s scans</p>
          {resultSplit.length === 0 ? (
            <p className="grid h-[190px] place-items-center text-[13px] text-white/35">No scans yet today.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={190}>
                <PieChart>
                  <Pie data={resultSplit} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} strokeWidth={0}>
                    {resultSplit.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 space-y-2.5">
                {resultSplit.map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2.5 text-[13px]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} aria-hidden />
                    <span className="flex-1 text-white/60">{d.name}</span>
                    <span className="font-mono font-semibold tabular-nums text-white">{d.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
