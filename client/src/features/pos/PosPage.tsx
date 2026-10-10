import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  CheckCircle2,
  Minus,
  Nfc,
  Plus,
  RefreshCw,
  ShieldX,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Undo2,
  Wallet,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { inr } from '../../lib/format';
import { newId } from '../../lib/utils';
import { Badge, Button, Card, Field, Input, PageHeader, useConfirm } from '../../components/ui';
import { useReader } from '../nfc/useReader';
import type { NfcTag } from '../nfc/nfcReader';
import { cn } from '../../lib/utils';

interface ChargeResult {
  result: string;
  message?: string;
  walletTransaction?: { _id: string; balanceAfterMinor: number };
}

interface RecentSale {
  _id: string;
  amountMinor: number;
  reason?: string;
  createdAt: string;
  holder: string;
}

interface Settlement {
  date: string;
  timezone: string;
  bounds: { from: string; to: string };
  salesCount: number;
  salesVolumeMinor: number;
  refundCount: number;
  refundVolumeMinor: number;
  netVolumeMinor: number;
  avgTicketMinor: number;
  topupCount: number;
  topupVolumeMinor: number;
  deniedPayments: number;
  hourly: { hour: number; count: number; volumeMinor: number }[];
  recent: RecentSale[];
}

interface MenuItem {
  name: string;
  priceMinor: number;
}

interface CartLine extends MenuItem {
  qty: number;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PosPage(): JSX.Element {
  const qc = useQueryClient();
  const { ask, dialog } = useConfirm();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [custom, setCustom] = useState('');
  const [receipt, setReceipt] = useState<{ uid: string; at: Date; totalMinor: number; res: ChargeResult } | null>(null);
  const [date, setDate] = useState<string>(() => todayLocal());
  const [downloading, setDownloading] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const on = (): void => setIsOnline(true);
    const off = (): void => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const menuQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data.data as { settings: { posMenu?: MenuItem[] } },
  });
  const menu = menuQuery.data?.settings.posMenu ?? [];

  const totalMinor = useMemo(() => cart.reduce((s, l) => s + l.priceMinor * l.qty, 0), [cart]);

  const charge = useMutation({
    mutationFn: async ({ tag, mode, amountMinor }: { tag: NfcTag; mode: string; amountMinor: number }) =>
      (await api.post('/nfc/scan', { nfcUid: tag.uid, action: 'PAYMENT', amountMinor, requestId: `pos_${newId()}` }, { headers: { 'X-NFC-Adapter': mode } }))
        .data.data as ChargeResult,
    onSuccess: (res, { tag, amountMinor }) => {
      setReceipt({ uid: tag.uid, at: new Date(), totalMinor: amountMinor, res });
      if (res.result === 'SUCCESS') {
        setCart([]);
        // Refresh totals + recent sales immediately instead of waiting for the 30s poll.
        qc.invalidateQueries({ queryKey: ['settlement'] });
      }
    },
    onError: (e: unknown, vars) => {
      setReceipt({ uid: vars.tag.uid, at: new Date(), totalMinor: vars.amountMinor, res: { result: 'ERROR', message: (e as Error).message } });
    },
  });

  const { mode, setMode, status, beginPhoneScan, phoneActive, phoneError } = useReader({
    paused: charge.isPending || !isOnline || totalMinor <= 0,
    onTag: (tag) => {
      if (totalMinor <= 0 || !isOnline) return;
      charge.mutate({ tag, mode, amountMinor: totalMinor });
    },
  });

  const settlement = useQuery({
    queryKey: ['settlement', date],
    queryFn: async () => (await api.get('/reports/settlement', { params: date ? { date } : {} })).data.data as Settlement,
    refetchInterval: 30000,
  });

  const voidTxn = useMutation({
    mutationFn: async (transactionId: string) => (await api.post('/pos/void', { transactionId })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlement'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });

  async function downloadCsv(): Promise<void> {
    const b = settlement.data?.bounds;
    if (!b || downloading) return;
    setDownloading(true);
    try {
      const res = await api.get('/reports/export', { params: { domain: 'transactions', from: b.from, to: b.to }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `pos-${settlement.data?.date ?? 'today'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function askVoid(sale: RecentSale): Promise<void> {
    if (!(await ask({ title: `Void ${inr(sale.amountMinor)}?`, body: `${sale.holder} · ${format(new Date(sale.createdAt), 'HH:mm:ss')} — balance is restored immediately.`, danger: true, confirmLabel: 'Void charge' }))) return;
    voidTxn.mutate(sale._id);
  }

  function addItem(item: MenuItem): void {
    setReceipt(null);
    setCart((c) => {
      const found = c.find((l) => l.name === item.name && l.priceMinor === item.priceMinor);
      if (found) return c.map((l) => (l === found ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { ...item, qty: 1 }];
    });
  }

  function addCustom(): void {
    const paise = Math.round(Number(custom) * 100);
    if (!Number.isFinite(paise) || paise <= 0) return;
    addItem({ name: 'Custom', priceMinor: paise });
    setCustom('');
  }

  const ok = receipt?.res.result === 'SUCCESS';
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);
  const qtyOf = (m: MenuItem): number => cart.find((l) => l.name === m.name && l.priceMinor === m.priceMinor)?.qty ?? 0;
  const canCharge = totalMinor > 0 && isOnline && !charge.isPending;
  const readerLabel = mode === 'keyboard' ? 'USB reader' : mode === 'phone' ? 'Phone NFC' : 'Bridge';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 sm:space-y-5">
      <PageHeader
        title="Canteen POS"
        subtitle={`${readerLabel} · ${status}${phoneActive ? ' · tap ready' : ''}`}
      />

      {!isOnline && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5 text-sm text-amber-200" role="alert">
          <WifiOff size={15} className="shrink-0" aria-hidden />
          Offline — payments are disabled until reconnect. Balances cannot be verified offline.
        </p>
      )}

      {/* Reader strip */}
      <Card className="!p-3 sm:!p-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/20 p-1 sm:w-auto" role="group" aria-label="Reader adapter">
            {([
              { id: 'keyboard', label: 'USB' },
              { id: 'phone', label: 'Phone' },
              { id: 'bridge', label: 'Bridge' },
            ] as const).map((r) => (
              <button
                key={r.id}
                onClick={() => setMode(r.id)}
                aria-pressed={mode === r.id}
                className={cn(
                  'h-9 rounded-lg px-2 text-[13px] font-medium transition sm:px-3.5',
                  mode === r.id ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-white',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <span className={cn('h-1.5 w-1.5 rounded-full', status === 'connected' ? 'animate-pulse bg-emerald-400' : 'bg-red-400')} aria-hidden />
            {status}
            {mode === 'phone' && phoneActive && <span className="text-emerald-300">· hold band to this phone</span>}
          </span>
          {mode === 'phone' && !phoneActive && (
            <Button onClick={beginPhoneScan} className="w-full sm:ml-auto sm:w-auto">Enable phone NFC</Button>
          )}
        </div>
        {mode === 'phone' && !phoneActive && (
          <p className="mt-2 text-xs text-muted-foreground">Web NFC needs Android Chrome/Edge + HTTPS — iPhone Safari cannot tap-scan.</p>
        )}
        {phoneError && <p className="mt-2 text-sm text-red-500" role="alert">{phoneError}</p>}
      </Card>

      {/* Counter grid: order-taking + sticky charge panel */}
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          {/* Menu */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Menu</h2>
              {menu.length === 0 && <span className="text-xs text-muted-foreground">Empty — add items in Settings</span>}
            </div>
            {menu.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
                {menu.map((m) => {
                  const qty = qtyOf(m);
                  return (
                    <button
                      key={`${m.name}-${m.priceMinor}`}
                      onClick={() => addItem(m)}
                      aria-label={`Add ${m.name}, ${inr(m.priceMinor)}${qty > 0 ? `, ${qty} in bill` : ''}`}
                      className={cn(
                        'relative min-h-[64px] rounded-xl border p-3 text-left transition active:scale-[0.98]',
                        qty > 0
                          ? 'border-transparent bg-primary/[0.12] ring-1 ring-primary'
                          : 'border-border hover:border-white/20 hover:bg-muted/50',
                      )}
                    >
                      {qty > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                          {qty}
                        </span>
                      )}
                      <span className="block truncate text-sm font-semibold">{m.name}</span>
                      <span className="mt-0.5 block font-mono text-sm text-muted-foreground">{inr(m.priceMinor)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="w-full max-w-44">
                <Field label="Custom amount ₹" htmlFor="pos-custom">
                  <Input
                    id="pos-custom"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addCustom();
                    }}
                  />
                </Field>
              </div>
              <Button variant="secondary" onClick={addCustom} className="shrink-0"><Plus size={15} aria-hidden /> Add</Button>
            </div>
          </Card>

          {/* Bill */}
          <Card className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold">
                <ShoppingCart size={16} className="text-[#E5BE6B]" aria-hidden /> Bill
                {itemCount > 0 && <span className="text-sm font-normal text-muted-foreground">· {itemCount} item{itemCount === 1 ? '' : 's'}</span>}
              </h2>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-white" aria-label="Clear bill">
                  <Trash2 size={13} aria-hidden /> Clear
                </button>
              )}
            </div>
            {cart.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
                Tap menu items to build the bill, then tap the band to charge.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {cart.map((l) => (
                  <li key={`${l.name}-${l.priceMinor}`} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{l.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{inr(l.priceMinor)} each</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="mr-1 font-mono text-sm font-semibold">{inr(l.priceMinor * l.qty)}</span>
                      <button
                        onClick={() => setCart((c) => c.map((x) => (x === l ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0))}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-muted" aria-label={`Remove one ${l.name}`}
                      >
                        <Minus size={14} aria-hidden />
                      </button>
                      <span className="w-6 text-center font-mono text-sm" aria-live="polite">{l.qty}</span>
                      <button
                        onClick={() => setCart((c) => c.map((x) => (x === l ? { ...x, qty: x.qty + 1 } : x)))}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-muted" aria-label={`Add one ${l.name}`}
                      >
                        <Plus size={14} aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Charge panel — sticky on desktop, in-flow on phones */}
        <aside className="min-w-0 xl:sticky xl:top-4">
          <Card className="space-y-4 border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total due</p>
              <p className="mt-1 font-mono text-4xl font-bold tracking-tight sm:text-5xl" aria-live="polite">{inr(totalMinor)}</p>
            </div>

            <div
              className={cn(
                'grid place-items-center rounded-2xl border py-6 text-center transition',
                !isOnline
                  ? 'border-amber-400/30 bg-amber-400/[0.06]'
                  : charge.isPending
                    ? 'border-primary/50 bg-primary/[0.08]'
                    : canCharge
                      ? 'border-[#D4A853]/40 bg-[#D4A853]/[0.06]'
                      : 'border-dashed border-white/10',
              )}
              role="status"
              aria-label={!isOnline ? 'Offline' : charge.isPending ? 'Charging' : canCharge ? 'Ready to charge' : 'Build a bill first'}
            >
              {!isOnline ? (
                <span className="flex flex-col items-center gap-2 px-4 text-amber-200">
                  <WifiOff size={26} aria-hidden />
                  <span className="text-sm font-medium">Offline — charging paused</span>
                </span>
              ) : charge.isPending ? (
                <span className="flex flex-col items-center gap-2 px-4">
                  <RefreshCw size={26} className="animate-spin text-[#E5BE6B]" aria-hidden />
                  <span className="text-sm font-medium">Charging {inr(totalMinor)}…</span>
                </span>
              ) : canCharge ? (
                <span className="flex flex-col items-center gap-2 px-4">
                  <span className="relative grid place-items-center">
                    <span className="absolute h-14 w-14 animate-ping rounded-full bg-[#D4A853]/20" aria-hidden />
                    <span className="relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-b from-[#F0D48A] to-[#8F6A2E] text-black">
                      <Nfc size={24} aria-hidden />
                    </span>
                  </span>
                  <span className="text-sm font-semibold">Tap band to charge</span>
                  <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                    <Wifi size={12} aria-hidden /> {readerLabel} connected
                  </span>
                </span>
              ) : (
                <span className="flex flex-col items-center gap-2 px-4 text-white/35">
                  <Nfc size={26} aria-hidden />
                  <span className="text-sm">Add items to start a bill</span>
                </span>
              )}
            </div>

            {receipt && (
              <div
                role={ok ? 'status' : 'alert'}
                className={cn(
                  'space-y-1 rounded-xl border p-4',
                  ok ? 'border-emerald-400/30 bg-emerald-400/[0.07]' : 'border-red-500/40 bg-red-500/[0.08]',
                )}
              >
                <p className={cn('flex items-center gap-2 text-lg font-bold', ok ? 'text-emerald-300' : 'text-red-300')}>
                  {ok ? <CheckCircle2 size={19} aria-hidden /> : <XCircle size={19} aria-hidden />}
                  {ok ? `Paid ${inr(receipt.totalMinor)}` : 'Payment declined'}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{receipt.uid} · {format(receipt.at, 'HH:mm:ss')}</p>
                {!ok && <p className="text-sm text-red-300">{receipt.res.message ?? receipt.res.result}</p>}
                {ok && receipt.res.walletTransaction && (
                  <p className="text-xs text-muted-foreground">
                    Txn {receipt.res.walletTransaction._id.slice(-8)} · Balance after {inr(receipt.res.walletTransaction.balanceAfterMinor)}
                  </p>
                )}
              </div>
            )}
            <p className="text-center text-[11px] leading-relaxed text-white/30">Double-taps dedupe server-side — one tap, one charge.</p>
          </Card>
        </aside>
      </div>

      {/* Settlement */}
      <Card className="space-y-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h2 className="font-semibold">
            Settlement
            {settlement.data && <span className="block text-xs font-normal text-muted-foreground sm:inline"> · {settlement.data.date} ({settlement.data.timezone})</span>}
          </h2>
          <div className="flex items-center gap-2">
            <Input aria-label="Settlement date" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} className="h-10 min-w-0 flex-1 sm:w-40 sm:flex-none" />
            <Button variant="secondary" onClick={() => settlement.refetch()}>Refresh</Button>
          </div>
        </div>

        {settlement.data ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <SettleStat icon={TrendingUp} label="Sales" value={inr(settlement.data.salesVolumeMinor)} sub={`${settlement.data.salesCount} txns`} tone="gold" />
            <SettleStat icon={Wallet} label="Net" value={inr(settlement.data.netVolumeMinor)} sub={`avg ${inr(settlement.data.avgTicketMinor)}`} tone="green" />
            <SettleStat icon={Undo2} label="Refunds" value={inr(settlement.data.refundVolumeMinor)} sub={`${settlement.data.refundCount} txns`} tone="neutral" />
            <SettleStat icon={ShieldX} label="Denied" value={String(settlement.data.deniedPayments)} sub="low balance / frozen" tone="red" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {settlement.data && settlement.data.recent.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Recent sales</h3>
              <button
                onClick={() => settlement.refetch()}
                disabled={settlement.isFetching}
                className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-50"
                aria-label="Refresh recent sales"
                title="Refresh recent sales"
              >
                <RefreshCw size={15} className={settlement.isFetching ? 'animate-spin' : ''} aria-hidden />
              </button>
            </div>
            <ul className="divide-y divide-border">
              {settlement.data.recent.map((s) => (
                <li key={s._id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{s.holder}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(s.createdAt), 'HH:mm:ss')}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-sm">{inr(s.amountMinor)}</span>
                    <button onClick={() => askVoid(s)} disabled={voidTxn.isPending} className="h-9 rounded-lg border border-border px-3 text-xs hover:bg-muted disabled:opacity-50">Void</button>
                  </span>
                </li>
              ))}
            </ul>
            {voidTxn.isError && <p className="mt-1 text-sm text-red-500" role="alert">{(voidTxn.error as Error).message}</p>}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button variant="secondary" disabled={!settlement.data || downloading} onClick={downloadCsv} className="w-full sm:w-auto">
            {downloading ? 'Preparing…' : 'Download day CSV'}
          </Button>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge value={settlement.isFetching ? 'SYNCING' : 'LIVE'} /> auto-refreshes every 30s
          </span>
        </div>
      </Card>
      {dialog}
    </div>
  );
}

function SettleStat({ icon: Icon, label, value, sub, tone }: {
  icon: typeof Wallet; label: string; value: string; sub: string; tone: 'gold' | 'green' | 'neutral' | 'red';
}): JSX.Element {
  return (
    <div className={cn(
      'rounded-xl border p-3 sm:p-3.5',
      tone === 'gold' && 'border-[#D4A853]/25 bg-[#D4A853]/[0.05]',
      tone === 'green' && 'border-emerald-400/20 bg-emerald-400/[0.04]',
      tone === 'red' && 'border-red-400/20 bg-red-400/[0.04]',
      tone === 'neutral' && 'border-border',
    )}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon size={13} aria-hidden />{label}</p>
      <p className="mt-1 truncate font-mono text-lg font-bold sm:text-xl" title={value}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
