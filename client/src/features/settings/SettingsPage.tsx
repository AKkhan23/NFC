import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  HardDrive,
  Loader2,
  PlugZap,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Divider,
  Field,
  Input,
  PageHeader,
  Skeleton,
  SuccessNote,
  useConfirm,
} from '../../components/ui';
import { cn } from '../../lib/utils';

interface OrgSettings {
  name: string;
  slug: string;
  status: string;
  contactEmail?: string;
  settings: {
    timezone: string;
    attendanceLateAfter: string;
    attendanceDayEnd: string;
    dupScanWindowMs: number;
    upiPayeeVpa?: string;
    upiPayeeName?: string;
    minTopupMinor?: number;
    maxTopupMinor?: number;
    posMenu?: { name: string; priceMinor: number }[];
  };
}

type DbMode = 'local' | 'cluster';

interface DbStatus {
  mode: DbMode | 'memory' | 'custom';
  configuredMode: DbMode;
  activeUriRedacted: string;
  host: string;
  dbName: string;
  isAtlas: boolean;
  readyState: number;
  readyLabel: string;
  connectedAt: string | null;
  uptimeSec: number | null;
  localConfigured: boolean;
  clusterConfigured: boolean;
  localUriRedacted: string;
  clusterUriRedacted: string;
  useMemoryDb: boolean;
  seeded?: boolean;
}

interface TestResult {
  ok: boolean;
  latencyMs?: number;
  host?: string;
  dbName?: string;
  error?: string;
}

function fmtUptime(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function DatabaseSection(): JSX.Element {
  const qc = useQueryClient();
  const { ask, dialog } = useConfirm();
  const [pick, setPick] = useState<DbMode | null>(null);
  const [customUri, setCustomUri] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const status = useQuery({
    queryKey: ['database-status'],
    queryFn: async () => (await api.get('/system/database/status')).data.data as DbStatus,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (status.data && pick === null) setPick(status.data.configuredMode);
  }, [status.data, pick]);

  const test = useMutation({
    mutationFn: async (body: { mode: DbMode; uri?: string }) =>
      (await api.post('/system/database/test', body)).data.data as TestResult,
  });

  const sw = useMutation({
    mutationFn: async (body: { mode: DbMode; uri?: string }) =>
      (await api.post('/system/database/switch', body)).data.data as DbStatus,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['database-status'] });
      test.reset();
    },
  });

  const active: DbMode | null = pick ?? status.data?.configuredMode ?? null;
  const isActiveChoice =
    status.data != null &&
    active != null &&
    (status.data.mode === active ||
      (status.data.useMemoryDb === false && status.data.configuredMode === active));
  const targetMissing =
    status.data != null &&
    active != null &&
    ((active === 'local' && !status.data.localConfigured) ||
      (active === 'cluster' && !status.data.clusterConfigured && !showCustom && !customUri.trim()));

  async function onSwitch(): Promise<void> {
    if (!active) return;
    const ok = await ask({
      title: `Switch database to ${active === 'local' ? 'Local' : 'Atlas Cluster'}?`,
      body: 'The server reconnects immediately. Data is NOT migrated — each database has its own bands, users and scans. An empty target is auto-seeded with demo data.',
      confirmLabel: `Switch to ${active}`,
    });
    if (!ok) return;
    sw.mutate({ mode: active, ...(showCustom && customUri.trim() ? { uri: customUri.trim() } : {}) });
  }

  return (
    <Card>
      <CardHeader
        title="Database"
        subtitle="Choose where your data lives. Switch live — no restart, no redeploy."
        action={
          <span className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/55">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                status.data?.readyLabel === 'connected' ? 'animate-pulse-dot bg-emerald-400' : 'bg-amber-400',
              )}
              aria-hidden
            />
            {status.isPending ? 'Checking…' : (status.data?.readyLabel ?? 'unknown')}
          </span>
        }
      />

      {status.isPending && <Skeleton className="h-44 w-full" />}
      {status.isError && (
        <p className="rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3.5 py-3 text-[13px] text-red-300" role="alert">
          {(status.error as Error).message}
        </p>
      )}

      {status.data && active && (
        <div className="space-y-4">
          {/* Live connection banner */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[12.5px]">
            <span className="flex items-center gap-2 font-medium text-white/80">
              <Database size={14} className="text-[#E5BE6B]" aria-hidden />
              Connected: <Badge value={status.data.useMemoryDb ? 'MEMORY' : status.data.isAtlas ? 'CLUSTER' : 'LOCAL'} />
            </span>
            <span className="font-mono text-[12px] text-white/45">{status.data.host}</span>
            <span className="text-white/30">·</span>
            <span className="font-mono text-[12px] text-white/45">{status.data.dbName}</span>
            <span className="ml-auto tabular-nums text-white/35">up {fmtUptime(status.data.uptimeSec)}</span>
          </div>

          {/* Mode picker */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Database source">
            {(
              [
                {
                  mode: 'local' as DbMode,
                  icon: HardDrive,
                  title: 'Local MongoDB',
                  desc: 'Docker or mongod on this machine. Fastest, fully offline.',
                  uri: status.data.localUriRedacted,
                  ready: status.data.localConfigured,
                },
                {
                  mode: 'cluster' as DbMode,
                  icon: Cloud,
                  title: 'Atlas Cluster',
                  desc: 'Managed cloud DB. Shared across devices & deploys.',
                  uri: status.data.clusterConfigured ? status.data.clusterUriRedacted : 'Not configured',
                  ready: status.data.clusterConfigured,
                },
              ]
            ).map((o) => {
              const selected = active === o.mode;
              const live = !status.data.useMemoryDb && status.data.configuredMode === o.mode;
              return (
                <button
                  key={o.mode}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setPick(o.mode);
                    test.reset();
                    sw.reset();
                  }}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200',
                    selected
                      ? 'border-[#D4A853]/50 bg-[#D4A853]/[0.07] shadow-[0_0_32px_-12px_rgba(212,168,83,0.4)]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.18] hover:bg-white/[0.04]',
                  )}
                >
                  {live && (
                    <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-emerald-300">
                      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-400" aria-hidden />
                      LIVE
                    </span>
                  )}
                  <span className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'grid h-9 w-9 place-items-center rounded-xl border',
                        selected
                          ? 'border-[#D4A853]/40 bg-[#D4A853]/15 text-[#E5BE6B]'
                          : 'border-white/[0.08] bg-white/[0.04] text-white/55',
                      )}
                    >
                      <o.icon size={17} aria-hidden />
                    </span>
                    <span className="text-[14px] font-semibold text-white">{o.title}</span>
                  </span>
                  <span className="mt-2 block text-[12.5px] leading-relaxed text-white/45">{o.desc}</span>
                  <span className="mt-2.5 block truncate font-mono text-[11px] text-white/35" title={o.uri}>
                    {o.uri}
                  </span>
                  {!o.ready && (
                    <span className="mt-2 block text-[11.5px] font-medium text-amber-300/90">
                      No URI in .env — paste one below or add {o.mode === 'local' ? 'MONGODB_LOCAL_URI' : 'MONGODB_CLUSTER_URI'}.
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom URI override */}
          <div>
            <button
              onClick={() => setShowCustom((v) => !v)}
              className="text-[12.5px] font-medium text-[#D4A853]/90 hover:text-[#E5BE6B]"
              aria-expanded={showCustom}
            >
              {showCustom ? '− Hide custom URI' : '+ Use a custom connection string instead'}
            </button>
            {showCustom && (
              <Field
                label={active === 'cluster' ? 'Atlas connection string' : 'Local connection string'}
                hint={active === 'cluster' ? 'Starts with mongodb+srv:// — found in Atlas → Connect → Drivers.' : 'e.g. mongodb://127.0.0.1:27017/nfc_band_management'}
                htmlFor="db-custom-uri"
              >
                <Input
                  id="db-custom-uri"
                  value={customUri}
                  onChange={(e) => setCustomUri(e.target.value)}
                  placeholder={active === 'cluster' ? 'mongodb+srv://<user>:<password>@<host>/...' : 'mongodb://127.0.0.1:27017/...'}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono !text-[12.5px]"
                />
              </Field>
            )}
          </div>

          {/* Test result */}
          {test.data && (
            <div
              role="status"
              className={cn(
                'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px]',
                test.data.ok
                  ? 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200'
                  : 'border-red-500/25 bg-red-500/[0.07] text-red-200',
              )}
            >
              {test.data.ok ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
              ) : (
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              )}
              <span>
                {test.data.ok ? (
                  <>Reachable — {test.data.host} · {test.data.latencyMs}ms{test.data.dbName ? ` · db ${test.data.dbName}` : ''}.</>
                ) : (
                  <>Unreachable: {test.data.error}</>
                )}
              </span>
            </div>
          )}

          {sw.data?.seeded && <SuccessNote message="Target was empty — demo organization seeded automatically." />}
          {sw.isError && (
            <p className="rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3.5 py-3 text-[13px] text-red-300" role="alert">
              {(sw.error as Error).message}
            </p>
          )}

          <Divider />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={test.isPending || (!status.data.localConfigured && active === 'local' && !customUri.trim())}
              onClick={() =>
                test.mutate({ mode: active, ...(showCustom && customUri.trim() ? { uri: customUri.trim() } : {}) })
              }
            >
              {test.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <PlugZap size={15} aria-hidden />}
              {test.isPending ? 'Testing…' : 'Test connection'}
            </Button>
            <Button variant="gold" disabled={sw.isPending || isActiveChoice || targetMissing} onClick={onSwitch}>
              {sw.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />}
              {sw.isPending
                ? 'Switching…'
                : isActiveChoice
                  ? `Already on ${active}`
                  : `Switch to ${active}`}
            </Button>
            <button
              onClick={() => status.refetch()}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[12.5px] font-medium text-white/45 transition hover:bg-white/[0.06] hover:text-white"
            >
              <RefreshCw size={13} aria-hidden /> Refresh status
            </button>
          </div>

          <p className="text-[11.5px] leading-relaxed text-white/30">
            Switching reconnects the server instantly and is audited. Data is per-database (nothing is copied).
            Atlas targets need your IP whitelisted in Atlas → Network Access.
          </p>
        </div>
      )}
      {dialog}
    </Card>
  );
}

export function SettingsPage(): JSX.Element {
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm('settings.manage');
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const query = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data.data as OrgSettings,
  });
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.put('/settings', body)).data.data as OrgSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    },
  });

  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [menu, setMenu] = useState<{ name: string; price: string }[] | null>(null);
  const menuRows = menu ?? (query.data ? (query.data.settings.posMenu ?? []).map((m) => ({ name: m.name, price: String(m.priceMinor / 100) })) : []);

  function menuPayload(): { name: string; priceMinor: number }[] | undefined {
    if (!menu) return undefined;
    return menu
      .map((r) => ({ name: r.name.trim(), priceMinor: Math.round(Number(r.price) * 100) }))
      .filter((r) => r.name && Number.isFinite(r.priceMinor) && r.priceMinor > 0);
  }

  const s = form ?? (query.data ? {
    timezone: query.data.settings.timezone,
    attendanceLateAfter: query.data.settings.attendanceLateAfter,
    attendanceDayEnd: query.data.settings.attendanceDayEnd,
    dupScanWindowMs: String(query.data.settings.dupScanWindowMs),
    upiPayeeVpa: query.data.settings.upiPayeeVpa ?? '',
    upiPayeeName: query.data.settings.upiPayeeName ?? '',
    minTopupMinor: String((query.data.settings.minTopupMinor ?? 1000) / 100),
    maxTopupMinor: String((query.data.settings.maxTopupMinor ?? 1000000) / 100),
  } : null);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Settings"
        subtitle={query.data ? `${query.data.name} · ${query.data.slug}` : 'Organization settings.'}
        eyebrow="Workspace"
      />
      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.data && s && (
        <Card className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Timezone" htmlFor="s-tz">
              <Input id="s-tz" value={s.timezone} disabled={!canManage} onChange={(e) => setForm({ ...s, timezone: e.target.value })} placeholder="Asia/Kolkata" />
            </Field>
            <Field label="Duplicate scan window (ms)" htmlFor="s-dup">
              <Input id="s-dup" inputMode="numeric" value={s.dupScanWindowMs} disabled={!canManage} onChange={(e) => setForm({ ...s, dupScanWindowMs: e.target.value.replace(/[^0-9]/g, '') })} />
            </Field>
            <Field label="Late after (HH:mm)" htmlFor="s-late">
              <Input id="s-late" value={s.attendanceLateAfter} disabled={!canManage} onChange={(e) => setForm({ ...s, attendanceLateAfter: e.target.value })} />
            </Field>
            <Field label="School day ends (HH:mm)" htmlFor="s-end">
              <Input id="s-end" value={s.attendanceDayEnd} disabled={!canManage} onChange={(e) => setForm({ ...s, attendanceDayEnd: e.target.value })} />
            </Field>
            <Field label="UPI payee VPA" htmlFor="s-vpa">
              <Input id="s-vpa" value={s.upiPayeeVpa} disabled={!canManage} onChange={(e) => setForm({ ...s, upiPayeeVpa: e.target.value })} placeholder="school@upi" />
            </Field>
            <Field label="UPI payee name" htmlFor="s-vpaname">
              <Input id="s-vpaname" value={s.upiPayeeName} disabled={!canManage} onChange={(e) => setForm({ ...s, upiPayeeName: e.target.value })} placeholder="Sunrise Academy" />
            </Field>
            <Field label="Min top-up (₹)" htmlFor="s-min">
              <Input id="s-min" inputMode="decimal" value={s.minTopupMinor} disabled={!canManage} onChange={(e) => setForm({ ...s, minTopupMinor: e.target.value.replace(/[^0-9.]/g, '') })} />
            </Field>
            <Field label="Max top-up (₹)" htmlFor="s-max">
              <Input id="s-max" inputMode="decimal" value={s.maxTopupMinor} disabled={!canManage} onChange={(e) => setForm({ ...s, maxTopupMinor: e.target.value.replace(/[^0-9.]/g, '') })} />
            </Field>
          </div>
          <p className="text-xs leading-relaxed text-white/35">Late detection, early-exit, scan dedupe, and access windows all derive from these values. Changes are audited.</p>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Canteen menu (POS buttons)</p>
            {menuRows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input aria-label={`Item ${i + 1} name`} placeholder="Samosa" value={r.name} disabled={!canManage} onChange={(e) => setMenu(menuRows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input aria-label={`Item ${i + 1} price`} inputMode="decimal" placeholder="₹" value={r.price} disabled={!canManage} onChange={(e) => setMenu(menuRows.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/[^0-9.]/g, '') } : x)))} className="w-28 font-mono" />
                {canManage && <button onClick={() => setMenu(menuRows.filter((_, j) => j !== i))} className="rounded px-2 py-1 text-muted-foreground hover:bg-muted" aria-label={`Remove ${r.name || `item ${i + 1}`}`}>✕</button>}
              </div>
            ))}
            {canManage && menuRows.length < 50 && (
              <button onClick={() => setMenu([...menuRows, { name: '', price: '' }])} className="text-[12.5px] font-medium text-[#D4A853]/90 hover:text-[#E5BE6B]">+ Add item</button>
            )}
          </div>
          {save.isError && <p className="text-sm text-red-400" role="alert">{(save.error as Error).message}</p>}
          {saved && <p className="text-sm text-emerald-300" role="status">Settings saved.</p>}
          {canManage && (
            <div className="flex justify-end">
              <Button
                variant="gold"
                disabled={save.isPending}
                onClick={() => save.mutate({
                  timezone: s.timezone,
                  attendanceLateAfter: s.attendanceLateAfter,
                  attendanceDayEnd: s.attendanceDayEnd,
                  dupScanWindowMs: Number(s.dupScanWindowMs),
                  upiPayeeVpa: s.upiPayeeVpa,
                  upiPayeeName: s.upiPayeeName,
                  minTopupMinor: Math.round(Number(s.minTopupMinor) * 100),
                  maxTopupMinor: Math.round(Number(s.maxTopupMinor) * 100),
                  ...(menuPayload() !== undefined ? { posMenu: menuPayload() } : {}),
                })}
              >
                {save.isPending ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {canManage && <DatabaseSection />}
    </div>
  );
}
