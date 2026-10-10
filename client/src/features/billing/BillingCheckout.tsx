import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui';
import type { BillingStatus } from './BillingPage';

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

export function BillingCheckout({ data, onDone }: {
  data: { provider: string; subscriptionId?: string; clientSecret?: string };
  onDone: () => void;
}): JSX.Element {
  if (data.provider === 'RAZORPAY' && data.subscriptionId) {
    return <RazorpaySubCheckout subscriptionId={data.subscriptionId} onDone={onDone} />;
  }
  if (data.provider === 'STRIPE' && data.clientSecret) {
    return <StripeSubCheckout clientSecret={data.clientSecret} onDone={onDone} />;
  }
  return <p className="text-xs text-muted-foreground">Complete payment — the subscription activates automatically via webhook.</p>;
}

function RazorpaySubCheckout({ subscriptionId, onDone }: { subscriptionId: string; onDone: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const cfg = (await api.get('/wallets/topup/config')).data.data as { razorpay: { keyId: string } };
      await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      const Razorpay = (window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { open: () => void } }).Razorpay;
      await new Promise<void>((resolve, reject) => {
        const rzp = new Razorpay({
          key: cfg.razorpay.keyId,
          subscription_id: subscriptionId,
          name: 'AirData subscription',
          handler: () => resolve(),
          modal: { ondismiss: () => reject(new Error('Checkout closed — finish payment to activate')) },
        });
        rzp.open();
      });
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = (await api.get('/billing/status')).data.data as BillingStatus;
        if (st.status === 'ACTIVE') break;
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm">Subscription created — authorize the mandate to activate.</p>
      <Button disabled={busy} onClick={pay}>{busy ? 'Waiting for authorization…' : 'Authorize with Razorpay'}</Button>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}

function StripeSubCheckout({ clientSecret, onDone }: { clientSecret: string; onDone: () => void }): JSX.Element {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holderRef = useRef<{ el: unknown; stripe: unknown }>({ el: null, stripe: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = (await api.get('/wallets/topup/config')).data.data as { stripe: { publishableKey: string } };
        if (cancelled || !cfg.stripe.publishableKey) {
          if (!cancelled) setError('Stripe publishable key missing on server');
          return;
        }
        await loadScript('https://js.stripe.com/v3/');
        if (cancelled) return;
        const stripe = (window as unknown as { Stripe: (key: string) => unknown }).Stripe(cfg.stripe.publishableKey);
        const elements = (stripe as { elements: () => { create: (t: string) => { mount: (sel: string) => void } } }).elements();
        const card = elements.create('card');
        card.mount('#sub-card-slot');
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
  }, []);

  async function pay(): Promise<void> {
    const stripe = holderRef.current.stripe as null | {
      confirmCardPayment: (secret: string, opts: { payment_method: { card: unknown } }) => Promise<{ error?: { message?: string } }>;
    };
    if (!stripe) return;
    setBusy(true);
    setError(null);
    try {
      const out = await stripe.confirmCardPayment(clientSecret, { payment_method: { card: holderRef.current.el } });
      if (out.error) throw new Error(out.error.message ?? 'Card declined');
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = (await api.get('/billing/status')).data.data as BillingStatus;
        if (st.status === 'ACTIVE') break;
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div id="sub-card-slot" className="rounded-md border border-border bg-background p-3" />
      <Button disabled={!ready || busy} onClick={pay}>{busy ? 'Processing…' : 'Pay first invoice by card'}</Button>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
