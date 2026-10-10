import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { inr, parseRupees } from '../../lib/format';
import { Badge, Button, Card, Field, Input, PageHeader, useConfirm } from '../../components/ui';
import { useTransactions, useTopupCancel, useTopupConfig, useTopupConfirm, useTopupIntent, useTopupOrder, type TopupIntentResult, useWallet, useWalletOp } from './walletApi';
import { newId } from '../../lib/utils';

interface UserRow { _id: string; firstName: string; lastName: string; email: string; }

export function WalletPage(): JSX.Element {
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState('');
  const [userLabel, setUserLabel] = useState('');
  const [op, setOp] = useState<'credit' | 'debit' | 'adjust' | null>(null);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm('wallet.manage');
  const { ask, dialog } = useConfirm();

  const users = useQuery({
    queryKey: ['wallet-users', q],
    queryFn: async () => (await api.get('/users', { params: { search: q, pageSize: 6 } })).data.data.items as UserRow[],
    enabled: q.length >= 1,
  });
  const wallet = useWallet(userId || undefined);
  const txns = useTransactions({ page: 1, userId: userId || undefined });
  const freeze = useWalletOp('freeze');
  const unfreeze = useWalletOp('unfreeze');

  async function toggleFreeze(): Promise<void> {
    if (!wallet.data) return;
    const freezing = wallet.data.status === 'ACTIVE';
    if (!(await ask({
      title: freezing ? 'Freeze wallet?' : 'Unfreeze wallet?',
      body: freezing ? 'Debits will be refused until unfrozen.' : 'Normal wallet operation resumes.',
      danger: freezing,
    }))) return;
    (freezing ? freeze : unfreeze).mutate({ userId });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Wallet" subtitle="Balances, top-ups, debits, and adjustments." />
      <Card className="space-y-3">
        <Field label="Find wallet holder" htmlFor="w-user">
          <Input id="w-user" placeholder="Type a name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <ul className="divide-y divide-border">
          {(users.data ?? []).map((u) => (
            <li key={u._id}>
              <button
                onClick={() => { setUserId(u._id); setUserLabel(`${u.firstName} ${u.lastName}`); }}
                className={`w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted ${userId === u._id ? 'bg-muted font-medium' : ''}`}
              >
                {u.firstName} {u.lastName} <span className="text-muted-foreground">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {wallet.data && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{userLabel}</p>
              <p className="text-4xl font-semibold tracking-tight">{inr(wallet.data.balanceMinor)}</p>
            </div>
            <Badge value={wallet.data.status} />
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setOp('credit')}>Add money</Button>
              <Button variant="secondary" onClick={() => setOp('debit')}>Debit</Button>
              <Button variant="secondary" onClick={() => setOp('adjust')}>Adjust</Button>
              <Button variant="secondary" onClick={toggleFreeze}>
                {wallet.data.status === 'ACTIVE' ? 'Freeze' : 'Unfreeze'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {userId && <TopupCard userId={userId} canConfirm={canManage} />}

      {txns.data && txns.data.items.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Recent activity</h2>
          <ul className="divide-y divide-border text-sm">
            {txns.data.items.slice(0, 10).map((t) => (
              <li key={t._id} className="flex items-center justify-between py-2">
                <span>{t.type} · <span className="text-muted-foreground">{format(new Date(t.createdAt), 'PP p')}</span>
                  {t.reason && <span className="block text-xs text-muted-foreground">{t.reason}</span>}
                </span>
                <span className="text-right">
                  <span className={t.type === 'DEBIT' ? 'text-red-600' : 'text-green-700'}>
                    {t.type === 'DEBIT' ? '−' : '+'}{inr(t.amountMinor)}
                  </span>
                  <span className="block text-xs text-muted-foreground">bal {inr(t.balanceAfterMinor)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {op && userId && <MoneyDialog op={op} userId={userId} onClose={() => setOp(null)} />}
      {dialog}
    </div>
  );
}

function MoneyDialog({ op, userId, onClose }: { op: 'credit' | 'debit' | 'adjust'; userId: string; onClose: () => void }): JSX.Element {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const mutation = useWalletOp(op);
  const paise = parseRupees(amount);

  const valid = op === 'adjust' ? paise !== null && reason.trim().length >= 3 : paise !== null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={op}>
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-background p-6">
        <h2 className="font-semibold capitalize">{op === 'credit' ? 'Add money' : op}</h2>
        <Field label={op === 'adjust' ? 'Amount in ₹ (signed)' : 'Amount in ₹'} htmlFor="m-amt" error={amount !== '' && paise === null ? 'Enter a valid amount' : undefined}>
          <Input
            id="m-amt"
            inputMode="decimal"
            placeholder="e.g. 250.00"
            value={amount}
            onChange={(e) => setAmount(op === 'adjust' ? e.target.value.replace(/[^0-9.\-]/g, '') : e.target.value.replace(/[^0-9.]/g, ''))}
          />
        </Field>
        <Field label={op === 'adjust' ? 'Reason (required)' : 'Reason (optional)'} htmlFor="m-reason">
          <Input id="m-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {mutation.isError && <p className="text-sm text-red-600" role="alert">{(mutation.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid || mutation.isPending}
            onClick={() => {
              const body: Record<string, unknown> = {
                idempotencyKey: `${op}_${newId()}`,
                ...(reason.trim() ? { reason: reason.trim() } : {}),
              };
              if (op === 'adjust') body.deltaMinor = Math.round(Number(amount) * 100);
              else body.amountMinor = paise;
              mutation.mutate({ userId, body }, { onSuccess: onClose });
            }}
          >
            {mutation.isPending ? 'Processing…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TopupCard({ userId, canConfirm }: { userId: string; canConfirm: boolean }): JSX.Element {
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState('UPI');
  const [orderId, setOrderId] = useState<string | null>(null);
  const intent = useTopupIntent();
  const live = useTopupOrder(orderId);
  const confirm = useTopupConfirm();
  const cancel = useTopupCancel();
  const config = useTopupConfig();
  const paise = parseRupees(amount);

  const order = live.data ?? intent.data?.order;
  const latest = intent.data && intent.data.order._id === order?._id ? intent.data : null;
  const upiIntent = latest?.upiIntent ?? null;
  const gateway = latest?.gateway;
  const pending = order?.status === 'PENDING';

  function create(): void {
    if (paise === null) return;
    setOrderId(null);
    intent.reset();
    intent.mutate(
      { userId, body: { amountMinor: paise, provider, idempotencyKey: `topup_${newId()}` } },
      { onSuccess: (d) => setOrderId(d.order._id) },
    );
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Online top-up</h2>
        <p className="text-sm text-muted-foreground">Create an order, collect payment, done — gateway payments credit automatically.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <Field label="Amount in ₹" htmlFor="t-amt" error={amount !== '' && paise === null ? 'Enter a valid amount' : undefined}>
            <Input id="t-amt" inputMode="decimal" placeholder="e.g. 500.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          </Field>
        </div>
        <div>
          <Field label="Method" htmlFor="t-provider">
            <select
              id="t-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="UPI">UPI QR</option>
              {config.data?.razorpay.enabled && <option value="RAZORPAY">Card / UPI via Razorpay</option>}
              {config.data?.stripe.enabled && <option value="STRIPE">Card via Stripe</option>}
              <option value="MANUAL">Cash at counter</option>
            </select>
          </Field>
        </div>
        <Button disabled={paise === null || intent.isPending} onClick={create}>
          {intent.isPending ? 'Creating…' : 'Create order'}
        </Button>
      </div>
      {intent.isError && <p className="text-sm text-red-600" role="alert">{(intent.error as Error).message}</p>}

      {order && (
        <div className="rounded-lg border border-border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span>Order <span className="font-mono">{order.reference ?? order._id}</span></span>
            <Badge value={order.status} />
          </div>
          <p className="mt-1 text-2xl font-semibold">{inr(order.amountMinor)}</p>
          {pending && upiIntent && (
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <span className="rounded-lg bg-white p-2">
                <QRCodeSVG value={upiIntent} size={160} aria-label="UPI payment QR" />
              </span>
              <div className="min-w-48 flex-1 space-y-2">
                <p className="break-all text-xs text-muted-foreground">{upiIntent}</p>
                <div className="flex flex-wrap gap-2">
                  <a href={upiIntent} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Open UPI app</a>
                  <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(upiIntent)}>Copy link</Button>
                </div>
                <p className="text-xs text-muted-foreground">Scan with any UPI app, then staff hits Confirm below.</p>
              </div>
            </div>
          )}
          {pending && gateway?.live && order.provider === 'RAZORPAY' && (
            <RazorpayCheckout intent={latest} onPaid={() => live.refetch()} />
          )}
          {pending && gateway?.live && order.provider === 'STRIPE' && (
            <StripeCardForm intent={latest} onPaid={() => live.refetch()} />
          )}
          {pending && gateway && !gateway.live && (order.provider === 'RAZORPAY' || order.provider === 'STRIPE') && (
            <p className="mt-2 text-xs text-amber-600">Gateway not wired on the server — collect cash/UPI and confirm below.</p>
          )}
          {pending && (
            <div className="mt-3 flex flex-wrap gap-2">
              {canConfirm && (
                <Button
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate({ orderId: order._id, providerReference: `COUNTER-${new Date().getTime()}` })}
                >
                  {confirm.isPending ? 'Confirming…' : 'Confirm payment received'}
                </Button>
              )}
              <Button variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate(order._id, { onSuccess: () => setOrderId(null) })}>Cancel</Button>
            </div>
          )}
          {(confirm.isError || live.isError) && (
            <p className="mt-2 text-sm text-red-600" role="alert">{((confirm.error ?? live.error) as Error).message}</p>
          )}
          {order.status === 'SUCCESS' && <p className="mt-2 text-sm text-green-700" role="status">Credited. Ledger updated exactly once.</p>}
        </div>
      )}
    </Card>
  );
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

function RazorpayCheckout({ intent, onPaid }: { intent: TopupIntentResult | null; onPaid: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gw = intent?.gateway;

  async function pay(): Promise<void> {
    if (!intent || !gw?.providerOrderId || !gw.keyId) return;
    setBusy(true);
    setError(null);
    try {
      await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      const Razorpay = (window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { open: () => void } }).Razorpay;
      await new Promise<void>((resolve, reject) => {
        const rzp = new Razorpay({
          key: gw.keyId,
          order_id: gw.providerOrderId,
          amount: intent.order.amountMinor,
          currency: 'INR',
          name: 'Wallet top-up',
          description: intent.order.reference,
          handler: (resp: unknown) => {
            const r = resp as { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
            api.post('/wallets/topup/webhook/razorpay/callback', {
              razorpay_order_id: r.razorpay_order_id,
              razorpay_payment_id: r.razorpay_payment_id,
              razorpay_signature: r.razorpay_signature,
            }).then(() => {
              onPaid();
              resolve();
            }).catch((e: unknown) => reject(e instanceof Error ? e : new Error('Verification failed')));
          },
          modal: { ondismiss: () => reject(new Error('Payment window closed')) },
        });
        rzp.open();
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <Button disabled={busy} onClick={pay}>{busy ? 'Waiting for payment…' : `Pay ${inr(intent?.order.amountMinor ?? 0)} with Razorpay`}</Button>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}

function StripeCardForm({ intent, onPaid }: { intent: TopupIntentResult | null; onPaid: () => void }): JSX.Element {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holderRef = useRef<{ el: unknown; stripe: unknown }>({ el: null, stripe: null });
  const keyId = intent?.gateway?.keyId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadScript('https://js.stripe.com/v3/');
        if (cancelled || !keyId) return;
        const stripe = (window as unknown as { Stripe: (key: string) => unknown }).Stripe(keyId);
        const elements = (stripe as { elements: () => { create: (t: string) => { mount: (sel: string) => void } } }).elements();
        const card = elements.create('card');
        card.mount('#stripe-card-slot');
        holderRef.current = { el: card, stripe };
        setReady(true);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })().catch((e: unknown) => {
      if (!cancelled) setError((e as Error).message);
    });
    return () => {
      cancelled = true;
    };
  }, [keyId]);

  async function pay(): Promise<void> {
    const stripe = holderRef.current.stripe as null | {
      confirmCardPayment: (secret: string, opts: { payment_method: { card: unknown } }) => Promise<{ error?: { message?: string }; paymentIntent?: { status?: string } }>;
    };
    if (!stripe || !intent?.gateway?.clientSecret) return;
    setBusy(true);
    setError(null);
    try {
      const out = await stripe.confirmCardPayment(intent.gateway.clientSecret, { payment_method: { card: holderRef.current.el } });
      if (out.error) throw new Error(out.error.message ?? 'Card declined');
      onPaid();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div id="stripe-card-slot" className="rounded-md border border-border bg-background p-3" />
      <Button disabled={!ready || busy} onClick={pay}>{busy ? 'Processing…' : `Pay ${inr(intent?.order.amountMinor ?? 0)} by card`}</Button>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
