import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Live payment gateways without extra SDK deps (plain HTTPS + node:crypto).
 * Secrets are read live from process.env (falling back to the parsed env
 * snapshot) so key rotation and tests don't require a restart/reimport.
 */
function secret(name: 'RAZORPAY_KEY_ID' | 'RAZORPAY_KEY_SECRET' | 'RAZORPAY_WEBHOOK_SECRET' | 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET' | 'STRIPE_PUBLISHABLE_KEY'): string {
  const live = process.env[name];
  if (live !== undefined) return live;
  return String((env as unknown as Record<string, unknown>)[name] ?? '');
}

export function gatewayConfig(): {
  upi: { enabled: boolean };
  manual: { enabled: boolean };
  mock: { enabled: boolean };
  razorpay: { enabled: boolean; keyId: string };
  stripe: { enabled: boolean; publishableKey: string };
} {
  const rzId = secret('RAZORPAY_KEY_ID');
  const rzSecret = secret('RAZORPAY_KEY_SECRET');
  const stSecret = secret('STRIPE_SECRET_KEY');
  return {
    upi: { enabled: true },
    manual: { enabled: true },
    mock: { enabled: true },
    razorpay: { enabled: !!rzId && !!rzSecret, keyId: rzId },
    stripe: { enabled: !!stSecret, publishableKey: secret('STRIPE_PUBLISHABLE_KEY') },
  };
}

export interface LiveOrder {
  live: boolean;
  providerOrderId: string;
  /** Razorpay checkout key / Stripe publishable key — public by design. */
  keyId?: string;
  /** Stripe PaymentIntent client secret (single-order, safe to hand to the payer). */
  clientSecret?: string;
}

async function postJson(url: string, init: { headers: Record<string, string>; body: string }, timeoutMs = 15000): Promise<{ status: number; json: Record<string, unknown> }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers: init.headers, body: init.body, signal: ctrl.signal });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Create the gateway-side order. Without configured keys this stays local
 * (staff confirm / generic webhook still settles it) — never fails the intent.
 */
export async function createGatewayOrder(
  provider: 'RAZORPAY' | 'STRIPE',
  input: { amountMinor: number; reference: string; localOrderId: string },
): Promise<LiveOrder> {
  const localId = `ord_${input.localOrderId.replace(/[^0-9a-f]/gi, '').slice(-16) || 'local'}`;
  if (provider === 'RAZORPAY') {
    const keyId = secret('RAZORPAY_KEY_ID');
    const keySecret = secret('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) return { live: false, providerOrderId: localId };
    const { status, json } = await postJson(
      'https://api.razorpay.com/v1/orders',
      {
        headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: input.amountMinor, currency: 'INR', receipt: input.reference.slice(0, 40) }),
      },
    );
    if (status < 200 || status >= 300 || typeof json.id !== 'string') {
      throw new Error(`Razorpay order failed (${status}): ${String((json.error as { description?: string })?.description ?? 'unknown')}`);
    }
    return { live: true, providerOrderId: json.id, keyId };
  }
  const stSecret = secret('STRIPE_SECRET_KEY');
  const publishable = secret('STRIPE_PUBLISHABLE_KEY');
  if (!stSecret) return { live: false, providerOrderId: localId };
  const form = new URLSearchParams({
    amount: String(input.amountMinor),
    currency: 'inr',
    'metadata[reference]': input.reference.slice(0, 80),
    'metadata[order]': input.localOrderId,
    ...(publishable ? {} : {}),
  });
  const { status, json } = await postJson('https://api.stripe.com/v1/payment_intents', {
    headers: { Authorization: `Bearer ${stSecret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (status < 200 || status >= 300 || typeof json.id !== 'string') {
    const msg = (json.error as { message?: string } | undefined)?.message ?? 'unknown';
    throw new Error(`Stripe intent failed (${status}): ${msg}`);
  }
  return { live: true, providerOrderId: json.id, keyId: publishable, clientSecret: typeof json.client_secret === 'string' ? json.client_secret : undefined };
}

/** Razorpay checkout callback: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyRazorpayCallback(input: { orderId: string; paymentId: string; signature: string }, keySecret: string): boolean {
  if (!input.orderId || !input.paymentId || !input.signature || !keySecret) return false;
  const expected = createHmac('sha256', keySecret).update(`${input.orderId}|${input.paymentId}`).digest('hex');
  return safeEqualHex(expected, input.signature);
}

/** Razorpay server webhook: HMAC_SHA256(rawBody, webhook_secret) vs x-razorpay-signature. */
export function verifyRazorpayWebhook(rawBody: Buffer, signature: string | undefined, webhookSecret: string): boolean {
  if (!signature || !webhookSecret || !rawBody) return false;
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

export interface StripeEvent {
  ok: boolean;
  type?: string;
  providerOrderId?: string;
  providerReference?: string;
  amountMinor?: number;
}

/**
 * Stripe server webhook: `t=..,v1=..` HMAC over `t.rawBody`, timestamp tolerance.
 * Returns the parsed event on success.
 */
export function verifyStripeWebhook(rawBody: Buffer, header: string | undefined, webhookSecret: string, toleranceSec = 300): StripeEvent {
  if (!header || !webhookSecret || !rawBody) return { ok: false };
  const parts = Object.fromEntries(header.split(',').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false };
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return { ok: false };
  const expected = createHmac('sha256', webhookSecret).update(`${parts.t}.${rawBody.toString('utf8')}`).digest('hex');
  if (!safeEqualHex(expected, v1)) return { ok: false };
  try {
    const evt = JSON.parse(rawBody.toString('utf8')) as { type?: string; data?: { object?: Record<string, unknown> } };
    const obj = evt.data?.object ?? {};
    return {
      ok: true,
      type: evt.type,
      providerOrderId: typeof obj.id === 'string' ? obj.id : undefined,
      providerReference: typeof (obj as { latest_charge?: unknown }).latest_charge === 'string' ? (obj as { latest_charge: string }).latest_charge : undefined,
      amountMinor: typeof obj.amount === 'number' ? obj.amount : undefined,
    };
  } catch {
    return { ok: false };
  }
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function razorpaySecrets(): { keyId: string; keySecret: string; webhookSecret: string } {
  return { keyId: secret('RAZORPAY_KEY_ID'), keySecret: secret('RAZORPAY_KEY_SECRET'), webhookSecret: secret('RAZORPAY_WEBHOOK_SECRET') };
}

export function stripeSecrets(): { secretKey: string; webhookSecret: string } {
  return { secretKey: secret('STRIPE_SECRET_KEY'), webhookSecret: secret('STRIPE_WEBHOOK_SECRET') };
}
