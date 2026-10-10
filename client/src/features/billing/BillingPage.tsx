import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Minus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { inr } from '../../lib/format';
import { useAuthStore } from '../../stores/authStore';
import { Badge, Button, Card, Field, Input, PageHeader, useConfirm } from '../../components/ui';
import { cn } from '../../lib/utils';
import { BillingCheckout } from './BillingCheckout';

export interface PlanInfo {
  id: string;
  name: string;
  priceMinor: number;
  trialDays: number;
  limits: { maxUsers: number; maxBands: number; maxLocations: number; maxEventsPerMonth: number };
  features: Record<string, boolean>;
}

export interface BillingStatus {
  plan: string;
  planName: string;
  priceMinor: number;
  status: string;
  trialEndsAt?: string;
  periodEnd?: string;
  graceUntil?: string;
  provider: string;
  usage: { users: number; bands: number };
  limits: PlanInfo['limits'];
  features: Record<string, boolean>;
  featureOverrides: Record<string, boolean>;
}

export const FEATURE_META: { key: string; label: string }[] = [
  { key: 'onlinePayments', label: 'Live gateway top-ups' },
  { key: 'pos', label: 'Canteen POS' },
  { key: 'visitors', label: 'Visitors & Day-QR' },
  { key: 'events', label: 'Events' },
  { key: 'tapProfiles', label: 'Tap profiles' },
  { key: 'reportsExport', label: 'CSV exports' },
  { key: 'apiAccess', label: 'API access' },
];

function Meter({ label, used, max }: { label: string; used: number; max: number }): JSX.Element {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground"><span>{label}</span><span className="font-mono">{used} / {max >= 100000 ? '∞' : max}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10"><div className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : 'bg-primary')} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function BillingPage(): JSX.Element {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm('settings.manage');
  const isSuper = user?.role === 'SUPER_ADMIN';
  const { ask, dialog } = useConfirm();
  const [email, setEmail] = useState('');
  const [provider, setProvider] = useState<'MANUAL' | 'RAZORPAY' | 'STRIPE'>('MANUAL');
  const [gatewayData, setGatewayData] = useState<{ provider: string; subscriptionId?: string; clientSecret?: string } | null>(null);

  const status = useQuery({
    queryKey: ['billing-status'],
    queryFn: async () => (await api.get('/billing/status')).data.data as BillingStatus,
  });
  const plans = useQuery({
    queryKey: ['billing-plans'],
    queryFn: async () => (await api.get('/billing/plans')).data.data as PlanInfo[],
  });

  const subscribe = useMutation({
    mutationFn: async (plan: string) =>
      (await api.post('/billing/subscribe', { plan, provider, ...(email.trim() ? { billingEmail: email.trim() } : {}) })).data.data as {
        plan: string; status: string; provider: string; subscriptionId?: string; checkoutUrl?: string; clientSecret?: string;
      },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['billing-status'] });
      if (d.provider === 'MANUAL' || d.status === 'ACTIVE') setGatewayData(null);
      else setGatewayData({ provider: d.provider, subscriptionId: d.subscriptionId, clientSecret: d.clientSecret });
    },
  });

  const cancel = useMutation({
    mutationFn: async () => (await api.post('/billing/cancel')).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-status'] }),
  });

  async function askCancel(): Promise<void> {
    if (!(await ask({ title: 'Cancel subscription?', body: 'Growth actions lock at the end of the paid period. Gates keep scanning either way.', danger: true, confirmLabel: 'Cancel subscription' }))) return;
    cancel.mutate();
  }

  const s = status.data;
  const paid = (plans.data ?? []).filter((p) => p.id !== 'TRIAL');
  const trialDaysLeft = s?.trialEndsAt ? Math.max(0, Math.ceil((new Date(s.trialEndsAt).getTime() - Date.now()) / 86400000)) : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader title="Billing" subtitle="Plans, usage, and subscription." />

      {status.data && (
        <Card className="relative space-y-4 overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#F0D48A] via-[#D4A853] to-[#8F6A2E]" aria-hidden />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Current plan</p>
              <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {status.data.planName}{' '}
                <span className="text-base font-normal text-muted-foreground">{status.data.priceMinor === 0 ? 'free' : `${inr(status.data.priceMinor)}/mo`}</span>
              </p>
            </div>
            <Badge value={status.data.status} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Meter label="Users" used={status.data.usage.users} max={status.data.limits.maxUsers} />
            <Meter label="Bands" used={status.data.usage.bands} max={status.data.limits.maxBands} />
          </div>
          <FeatureChips features={status.data.features} overrides={status.data.featureOverrides} />
          {status.data.status === 'TRIALING' && trialDaysLeft !== null && (
            <p className="text-sm text-amber-600" role="status">{trialDaysLeft} trial day{trialDaysLeft === 1 ? '' : 's'} left — pick a plan below to keep growing afterwards.</p>
          )}
          {status.data.status === 'PAST_DUE' && (
            <p className="text-sm text-red-600" role="alert">Payment overdue{status.data.graceUntil ? ` — grace until ${new Date(status.data.graceUntil).toLocaleDateString()}` : ''}.</p>
          )}
          {canManage && status.data.status === 'ACTIVE' && (
            <div><Button variant="secondary" onClick={askCancel} disabled={cancel.isPending}>Cancel subscription</Button></div>
          )}
          {cancel.isError && <p className="text-sm text-red-600" role="alert">{(cancel.error as Error).message}</p>}
        </Card>
      )}

      {canManage && (
        <section aria-label="Plans" className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full sm:w-52">
              <Field label="Billing email" htmlFor="b-email">
                <Input id="b-email" type="email" placeholder="billing@school.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
            <div className="w-full sm:w-auto">
              <Field label="Pay via" htmlFor="b-provider">
                <select id="b-provider" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm sm:w-auto">
                  <option value="MANUAL">Manual / offline invoice</option>
                  <option value="RAZORPAY">Razorpay subscription</option>
                  <option value="STRIPE">Stripe subscription</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {paid.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'relative flex flex-col rounded-2xl border p-5 transition',
                  s?.plan === p.id ? 'border-transparent bg-primary/[0.07] ring-2 ring-primary' : 'border-border hover:border-white/20',
                  p.id === 'ADVANCED' && 'md:-my-2 md:py-7 md:shadow-glow',
                )}
              >
                {p.id === 'ADVANCED' && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">Most popular</span>
                )}
                <p className="font-semibold">{p.name} {s?.plan === p.id && <span className="text-xs font-normal text-muted-foreground">(current)</span>}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight">{inr(p.priceMinor)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <ul className="mt-3 flex-1 space-y-1.5 text-[13px]">
                  <li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />{p.limits.maxUsers >= 100000 ? 'Unlimited' : p.limits.maxUsers} users · {p.limits.maxBands >= 100000 ? 'Unlimited' : p.limits.maxBands} bands</li>
                  {FEATURE_META.map((f) => (
                    <li key={f.key} className="flex gap-2">
                      {p.features[f.key]
                        ? <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                        : <X size={14} className="mt-0.5 shrink-0 text-muted-foreground/50" aria-hidden />}
                      <span className={p.features[f.key] ? '' : 'text-muted-foreground/60'}>{f.label}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={s?.plan === p.id ? 'secondary' : p.id === 'ADVANCED' ? 'gold' : 'secondary'}
                  disabled={subscribe.isPending}
                  className="mt-4 w-full"
                  onClick={() => subscribe.mutate(p.id)}
                >
                  {subscribe.isPending ? 'Working…' : s?.plan === p.id ? 'Re-subscribe' : `Choose ${p.name}`}
                </Button>
              </div>
            ))}
          </div>
          {subscribe.isError && <p className="text-sm text-red-600" role="alert">{(subscribe.error as Error).message}</p>}

          {gatewayData && (
            <BillingCheckout data={gatewayData} onDone={() => { setGatewayData(null); qc.invalidateQueries({ queryKey: ['billing-status'] }); }} />
          )}

          {/* Full comparison — scrolls horizontally on phones */}
          <Card className="space-y-2">
            <h2 className="font-semibold">Compare plans</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Feature</th>
                    {paid.map((p) => <th key={p.id} className="px-3 py-2 text-center font-medium">{p.name}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {FEATURE_META.map((f) => (
                    <tr key={f.key}>
                      <td className="py-2 pr-3">{f.label}</td>
                      {paid.map((p) => (
                        <td key={p.id} className="px-3 py-2 text-center">
                          {p.features[f.key]
                            ? <Check size={15} className="mx-auto text-emerald-500" aria-label="Included" />
                            : <Minus size={15} className="mx-auto text-muted-foreground/40" aria-label="Not included" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 pr-3">Users / Bands</td>
                    {paid.map((p) => (
                      <td key={p.id} className="px-3 py-2 text-center font-mono text-xs">
                        {p.limits.maxUsers >= 100000 ? '∞' : p.limits.maxUsers} / {p.limits.maxBands >= 100000 ? '∞' : p.limits.maxBands}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}

      {canManage && <ApiKeysCard />}
      {isSuper && <AdminOrgsConsole />}
      {dialog}
    </div>
  );
}

function FeatureChips({ features, overrides }: { features: Record<string, boolean>; overrides: Record<string, boolean> }): JSX.Element {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Enabled features">
      {FEATURE_META.filter((f) => features[f.key]).map((f) => (
        <li
          key={f.key}
          title={overrides[f.key] !== undefined ? 'Granted by administrator override' : 'Included in plan'}
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-medium',
            overrides[f.key] !== undefined
              ? 'border-[#D4A853]/50 bg-[#D4A853]/10 text-[#E5BE6B]'
              : 'border-white/10 bg-white/[0.04] text-white/70',
          )}
        >
          {f.label}{overrides[f.key] !== undefined ? ' ✦' : ''}
        </li>
      ))}
    </ul>
  );
}

const ALL_PERMS = [
  'nfc.scan', 'attendance.read', 'attendance.manage', 'bands.read', 'users.read',
  'wallet.read', 'wallet.manage', 'transactions.read', 'transactions.manage',
  'access.read', 'access.manage', 'devices.read', 'devices.manage',
  'locations.read', 'locations.manage', 'reports.read', 'audit.read',
];

function ApiKeysCard(): JSX.Element {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<string[]>(['nfc.scan', 'attendance.read', 'attendance.manage']);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => (await api.get('/billing/keys')).data.data as {
      items: { _id: string; name: string; prefix: string; permissions: string[]; createdAt: string; lastUsedAt?: string }[];
    },
  });
  const create = useMutation({
    mutationFn: async () => (await api.post('/billing/keys', { name: name.trim(), permissions: perms })).data.data as { key: string },
    onSuccess: (d) => {
      setFreshKey(d.key);
      setName('');
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
  const revoke = useMutation({
    mutationFn: async (keyId: string) => (await api.delete(`/billing/keys/${keyId}`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">API keys</h2>
        <p className="text-sm text-muted-foreground">Integrator access with least-privilege scopes. Send as <span className="font-mono">X-Api-Key</span>. Requires API access on your plan.</p>
      </div>
      {freshKey && (
        <div className="space-y-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3" role="status">
          <p className="text-sm font-semibold text-emerald-300">Copy now — this is shown once.</p>
          <p className="break-all font-mono text-xs">{freshKey}</p>
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(freshKey)}>Copy key</Button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <Field label="Key name" htmlFor="k-name"><Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gate tablet 1" /></Field>
        </div>
        <Button disabled={!name.trim() || perms.length === 0 || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Creating…' : 'Create key'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Key permissions">
        {ALL_PERMS.map((p) => (
          <button
            key={p}
            onClick={() => setPerms((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))}
            aria-pressed={perms.includes(p)}
            className={cn(
              'rounded-full border px-2.5 py-1 font-mono text-[11px]',
              perms.includes(p) ? 'border-transparent bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {p}
          </button>
        ))}
      </div>
      {create.isError && <p className="text-sm text-red-600" role="alert">{(create.error as Error).message}</p>}
      {(keys.data?.items.length ?? 0) > 0 && (
        <ul className="divide-y divide-border text-sm">
          {(keys.data?.items ?? []).map((k) => (
            <li key={k._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{k.name} <span className="font-mono text-xs text-muted-foreground">ak_{k.prefix}_… · {k.permissions.length} scopes{k.lastUsedAt ? ` · used ${new Date(k.lastUsedAt).toLocaleDateString()}` : ' · never used'}</span></span>
              <button onClick={() => revoke.mutate(k._id)} className="text-xs text-red-600 hover:underline">Revoke</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface AdminOrg {
  _id: string;
  name: string;
  slug: string;
  status: string;
  billingEmail?: string;
  subscription?: { plan?: string; status?: string; trialEndsAt?: string; periodEnd?: string; featureOverrides?: Record<string, boolean> };
  usage: { users: number; bands: number };
}

function AdminOrgsConsole(): JSX.Element {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<AdminOrg | null>(null);

  const orgs = useQuery({
    queryKey: ['admin-orgs', query],
    queryFn: async () => (await api.get('/billing/orgs', { params: query ? { search: query } : {} })).data.data as AdminOrg[],
  });

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Organization console</h2>
          <p className="text-sm text-muted-foreground">Every workspace, plan, and feature grant — at a glance.</p>
        </div>
        <div className="flex gap-2">
          <Input aria-label="Search organizations" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-40" />
          <Button variant="secondary" onClick={() => setQuery(search)}>Search</Button>
        </div>
      </div>
      {orgs.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Organization</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Use</th>
              <th className="px-3 py-2 text-right font-medium">Trial ends</th>
              <th className="py-2 pl-3 text-right font-medium"><span className="sr-only">Manage</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(orgs.data ?? []).map((o) => (
              <tr key={o._id}>
                <td className="py-2 pr-3"><p className="font-medium">{o.name}</p><p className="font-mono text-xs text-muted-foreground">{o.slug}{o.status === 'SUSPENDED' ? ' · SUSPENDED' : ''}</p></td>
                <td className="px-3 py-2"><Badge value={o.subscription?.plan ?? 'TRIAL'} /></td>
                <td className="px-3 py-2"><Badge value={o.subscription?.status ?? 'TRIALING'} /></td>
                <td className="px-3 py-2 text-right font-mono text-xs">{o.usage.users}u / {o.usage.bands}b</td>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">{o.subscription?.trialEndsAt ? new Date(o.subscription.trialEndsAt).toLocaleDateString() : '—'}</td>
                <td className="py-2 pl-3 text-right"><button onClick={() => setEditing(o)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {(orgs.data ?? []).map((o) => (
          <li key={o._id} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{o.name}</p>
              <button onClick={() => setEditing(o)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Manage</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge value={o.subscription?.plan ?? 'TRIAL'} />
              <Badge value={o.subscription?.status ?? 'TRIALING'} />
              {o.status === 'SUSPENDED' && <Badge value="SUSPENDED" />}
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{o.usage.users} users · {o.usage.bands} bands</p>
          </li>
        ))}
      </ul>
      {editing && (
        <OrgEditor
          org={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['admin-orgs'] });
          }}
        />
      )}
    </Card>
  );
}

function OrgEditor({ org, onClose, onSaved }: { org: AdminOrg; onClose: () => void; onSaved: () => void }): JSX.Element {
  const [plan, setPlan] = useState(org.subscription?.plan ?? 'TRIAL');
  const [status, setStatus] = useState(org.subscription?.status ?? 'TRIALING');
  const [suspended, setSuspended] = useState(org.status === 'SUSPENDED');
  const [trialEndsAt, setTrialEndsAt] = useState(org.subscription?.trialEndsAt ? org.subscription.trialEndsAt.slice(0, 10) : '');
  const [overrides, setOverrides] = useState<Record<string, boolean | null>>(() => ({ ...(org.subscription?.featureOverrides ?? {}) }));

  const save = useMutation({
    mutationFn: async () =>
      (await api.patch(`/billing/orgs/${org._id}`, {
        plan, status, suspended,
        ...(trialEndsAt ? { trialEndsAt: new Date(trialEndsAt).toISOString() } : {}),
        featureOverrides: overrides,
      })).data.data,
    onSuccess: onSaved,
  });

  function cycle(key: string): void {
    setOverrides((o) => {
      const cur = o[key] ?? null;
      return { ...o, [key]: cur === null ? true : cur === true ? false : null };
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={`Manage ${org.name}`}>
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-background p-5 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{org.name}</h3>
            <p className="font-mono text-xs text-muted-foreground">{org.slug} · {org.usage.users}u / {org.usage.bands}b</p>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-muted-foreground hover:bg-muted" aria-label="Close">✕</button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Plan" htmlFor="oe-plan">
            <select id="oe-plan" value={plan} onChange={(e) => setPlan(e.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
              {['TRIAL', 'BASIC', 'ADVANCED', 'PRO'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Status" htmlFor="oe-status">
            <select id="oe-status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
              {['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'].map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </Field>
          <Field label="Trial ends" htmlFor="oe-trial">
            <Input id="oe-trial" type="date" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={suspended} onChange={(e) => setSuspended(e.target.checked)} className="h-4 w-4 accent-red-500" />
            Suspended
          </label>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Feature overrides <span className="font-normal text-muted-foreground">(tap to cycle: default → allow → deny)</span></p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {FEATURE_META.map((f) => {
              const v = overrides[f.key] ?? null;
              return (
                <button
                  key={f.key}
                  onClick={() => cycle(f.key)}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm',
                    v === true ? 'border-emerald-400/40 bg-emerald-400/10' : v === false ? 'border-red-400/40 bg-red-400/10' : 'border-border',
                  )}
                >
                  <span>{f.label}</span>
                  <span className={cn('font-mono text-xs', v === null && 'text-muted-foreground')}>{v === null ? 'default' : v ? 'allow' : 'deny'}</span>
                </button>
              );
            })}
          </div>
        </div>
        {save.isError && <p className="text-sm text-red-600" role="alert">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>
    </div>
  );
}
