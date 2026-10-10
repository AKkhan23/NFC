import { z } from 'zod';
import type { AuthContext } from '../../middleware/auth.js';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import { writeAudit } from '../audit/audit.service.js';
import { Organization } from '../organizations/organization.model.js';
import { User } from '../users/user.model.js';
import { NFCBand } from '../bands/band.model.js';
import { emitToOrg } from '../../sockets/index.js';
import { PLANS, planOf, type SubscriptionStatus } from './plans.js';
import type { OrganizationDoc } from '../organizations/organization.model.js';
import { getOrgSubscription, planCatalog, effectiveFeatures, getOverrides } from './subscription.js';
import { razorpaySecrets, stripeSecrets, verifyRazorpayWebhook, verifyStripeWebhook } from '../wallets/gateway.js';

export const subscribeSchema = z.object({
  body: z.object({
    plan: z.enum(['BASIC', 'ADVANCED', 'PRO']),
    provider: z.enum(['MANUAL', 'RAZORPAY', 'STRIPE']).default('MANUAL'),
    billingEmail: z.string().email().max(160).optional(),
  }),
});

const overrideSchema = z.record(
  z.enum(['onlinePayments', 'pos', 'visitors', 'events', 'tapProfiles', 'reportsExport', 'apiAccess']),
  z.boolean().nullable(),
);

export const adminSetPlanSchema = z.object({
  params: z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id') }),
  body: z.object({
    plan: z.enum(['TRIAL', 'BASIC', 'ADVANCED', 'PRO']).optional(),
    status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED']).optional(),
    trialEndsAt: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    /** Per-feature grants (true) / denials (false); null clears back to plan default. */
    featureOverrides: overrideSchema.optional(),
    /** Suspend or restore the whole organization. */
    suspended: z.boolean().optional(),
  }).refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' }),
});

type SubDoc = NonNullable<OrganizationDoc['subscription']>;

/** Old orgs may lack the subdocument — materialize trial defaults on first write. */
function ensureSub(org: { subscription?: SubDoc | null }): SubDoc {
  if (!org.subscription) {
    org.subscription = {
      plan: 'TRIAL',
      status: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      provider: 'MANUAL',
    } as SubDoc;
  }
  return org.subscription;
}

function liveEnv(name: string): string {
  return process.env[name] ?? '';
}

async function gatewayPost(url: string, opts: { auth: string; json?: unknown; form?: URLSearchParams }): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: opts.json
        ? { Authorization: opts.auth, 'Content-Type': 'application/json' }
        : { Authorization: opts.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: opts.json ? JSON.stringify(opts.json) : opts.form?.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Gateway ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

export const billingService = {
  plans() {
    return planCatalog();
  },

  async status(auth: AuthContext) {
    const scope = orgFilter(auth);
    const sub = await getOrgSubscription(scope.organizationId);
    const plan = planOf(sub.plan);
    const [users, bands, features, overrides] = await Promise.all([
      User.countDocuments({ organizationId: scope.organizationId }),
      NFCBand.countDocuments({ organizationId: scope.organizationId }),
      effectiveFeatures(scope.organizationId),
      getOverrides(scope.organizationId),
    ]);
    return {
      plan: plan.id,
      planName: plan.name,
      priceMinor: plan.priceMinor,
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
      periodEnd: sub.periodEnd,
      graceUntil: sub.graceUntil,
      provider: sub.provider,
      usage: { users, bands },
      limits: plan.limits,
      features,
      featureOverrides: overrides,
    };
  },

  /** Org admin picks a plan. MANUAL activates immediately (offline invoice, audited); gateways return checkout data and activate on webhook. */
  async subscribe(auth: AuthContext, input: { plan: 'BASIC' | 'ADVANCED' | 'PRO'; provider: 'MANUAL' | 'RAZORPAY' | 'STRIPE'; billingEmail?: string }) {
    const scope = orgFilter(auth);
    const org = await Organization.findById(scope.organizationId);
    if (!org) throw new ApiError(404, 'NOT_FOUND', 'Organization not found');
    const plan = PLANS[input.plan];
    if (input.billingEmail) org.billingEmail = input.billingEmail;

    if (input.provider === 'MANUAL') {
      const s = ensureSub(org);
      s.plan = plan.id;
      s.status = 'ACTIVE';
      s.provider = 'MANUAL';
      await org.save();
      await billingAudit(scope.organizationId, auth.userId, 'BILLING_SUBSCRIBED', { plan: plan.id, provider: 'MANUAL' });
      emitToOrg(scope.organizationId, 'billing.updated', { plan: plan.id, status: 'ACTIVE' });
      return { plan: plan.id, status: 'ACTIVE', provider: 'MANUAL' as const };
    }

    if (input.provider === 'RAZORPAY') {
      const { keyId, keySecret } = razorpaySecrets();
      const planId = liveEnv(`RAZORPAY_PLAN_${plan.id}`);
      if (!keyId || !keySecret) throw new ApiError(503, 'INTERNAL_ERROR', 'Razorpay billing is not configured');
      if (!planId) throw new ApiError(400, 'VALIDATION_ERROR', `No Razorpay plan id configured (set RAZORPAY_PLAN_${plan.id})`);
      let sub: Record<string, unknown>;
      try {
        sub = await gatewayPost('https://api.razorpay.com/v1/subscriptions', {
          auth: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
          json: { plan_id: planId, customer_notify: 1, quantity: 1, notes: { org: scope.organizationId, plan: plan.id } },
        });
      } catch {
        throw new ApiError(502, 'INTERNAL_ERROR', 'Razorpay is unreachable — try again or choose manual billing');
      }
      if (typeof sub.id !== 'string') throw new ApiError(502, 'INTERNAL_ERROR', 'Razorpay did not return a subscription');
      const curStatus = (ensureSub(org).status as SubscriptionStatus | undefined) ?? 'TRIALING';
      const s = ensureSub(org);
      s.plan = plan.id;
      s.status = curStatus;
      s.provider = 'RAZORPAY';
      s.providerId = sub.id;
      await org.save();
      await billingAudit(scope.organizationId, auth.userId, 'BILLING_SUBSCRIBE_STARTED', { plan: plan.id, provider: 'RAZORPAY', providerId: sub.id });
      return { plan: plan.id, status: 'PENDING', provider: 'RAZORPAY' as const, subscriptionId: sub.id, checkoutUrl: sub.short_url };
    }

    // STRIPE
    const { secretKey } = stripeSecrets();
    const priceId = liveEnv(`STRIPE_PRICE_${plan.id}`);
    if (!secretKey) throw new ApiError(503, 'INTERNAL_ERROR', 'Stripe billing is not configured');
    if (!priceId) throw new ApiError(400, 'VALIDATION_ERROR', `No Stripe price configured (set STRIPE_PRICE_${plan.id})`);
    try {
      const email = input.billingEmail ?? org.billingEmail ?? org.contactEmail ?? undefined;
      const customer = await gatewayPost('https://api.stripe.com/v1/customers', {
        auth: `Bearer ${secretKey}`,
        form: new URLSearchParams({ ...(email ? { email } : {}), 'metadata[org]': scope.organizationId }),
      });
      if (typeof customer.id !== 'string') throw new Error('no customer');
      const sub = await gatewayPost('https://api.stripe.com/v1/subscriptions', {
        auth: `Bearer ${secretKey}`,
        form: new URLSearchParams({
          customer: customer.id,
          'items[0][price]': priceId,
          'metadata[org]': scope.organizationId,
          'metadata[plan]': plan.id,
          payment_behavior: 'default_incomplete',
          'expand[0]': 'latest_invoice.payment_intent',
        }),
      });
      if (typeof sub.id !== 'string') throw new Error('no subscription');
      const pi = (sub.latest_invoice as { payment_intent?: { client_secret?: string } } | undefined)?.payment_intent;
      const curStatus = (ensureSub(org).status as SubscriptionStatus | undefined) ?? 'TRIALING';
      const s = ensureSub(org);
      s.plan = plan.id;
      s.status = curStatus;
      s.provider = 'STRIPE';
      s.providerId = sub.id;
      await org.save();
      await billingAudit(scope.organizationId, auth.userId, 'BILLING_SUBSCRIBE_STARTED', { plan: plan.id, provider: 'STRIPE', providerId: sub.id });
      return { plan: plan.id, status: 'PENDING', provider: 'STRIPE' as const, subscriptionId: sub.id, clientSecret: pi?.client_secret };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(502, 'INTERNAL_ERROR', 'Stripe is unreachable — try again or choose manual billing');
    }
  },

  async cancel(auth: AuthContext) {
    const scope = orgFilter(auth);
    const org = await Organization.findById(scope.organizationId);
    if (!org) throw new ApiError(404, 'NOT_FOUND', 'Organization not found');
    const sub = (org.subscription ?? {}) as { provider?: string; providerId?: string; plan?: string };
    // Best-effort remote cancel; local state flips regardless.
    try {
      if (sub.provider === 'RAZORPAY' && sub.providerId) {
        const { keyId, keySecret } = razorpaySecrets();
        if (keyId && keySecret) {
          await gatewayPost(`https://api.razorpay.com/v1/subscriptions/${sub.providerId}/cancel`, {
            auth: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
            json: { cancel_at_cycle_end: 1 },
          });
        }
      } else if (sub.provider === 'STRIPE' && sub.providerId) {
        const { secretKey } = stripeSecrets();
        if (secretKey) {
          await gatewayPost(`https://api.stripe.com/v1/subscriptions/${sub.providerId}/cancel`, {
            auth: `Bearer ${secretKey}`,
            form: new URLSearchParams({ invoice_now: 'false' }),
          });
        }
      }
    } catch {
      /* remote cancel failed — local cancel still applies */
    }
    ensureSub(org).status = 'CANCELED';
    await org.save();
    await billingAudit(scope.organizationId, auth.userId, 'BILLING_CANCELED', { plan: sub.plan });
    emitToOrg(scope.organizationId, 'billing.updated', { status: 'CANCELED' });
    return { status: 'CANCELED' };
  },

  /** Razorpay subscription events. Public — HMAC verified. */
  async razorpayEvent(rawBody: Buffer, signature: string | undefined) {
    const { webhookSecret } = razorpaySecrets();
    if (!webhookSecret) throw new ApiError(503, 'INTERNAL_ERROR', 'Razorpay webhooks are not configured');
    if (!verifyRazorpayWebhook(rawBody, signature, webhookSecret)) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid Razorpay webhook signature');
    }
    let evt: { event?: string; payload?: { subscription?: { entity?: Record<string, unknown> } } };
    try {
      evt = JSON.parse(rawBody.toString('utf8')) as typeof evt;
    } catch {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid webhook payload');
    }
    const entity = evt.payload?.subscription?.entity;
    const providerId = typeof entity?.id === 'string' ? entity.id : undefined;
    if (!providerId) throw new ApiError(400, 'VALIDATION_ERROR', 'No subscription in event');
    const map: Record<string, SubscriptionStatus> = {
      'subscription.activated': 'ACTIVE',
      'subscription.charged': 'ACTIVE',
      'subscription.completed': 'CANCELED',
      'subscription.cancelled': 'CANCELED',
      'subscription.paused': 'PAST_DUE',
    };
    const status = map[evt.event ?? ''];
    if (!status) return { ignored: evt.event ?? 'unknown' };
    return applyRemoteStatus(providerId, status, entity);
  },

  /** Stripe subscription/invoice events. Public — HMAC verified. */
  async stripeEvent(rawBody: Buffer, signature: string | undefined) {
    const { webhookSecret } = stripeSecrets();
    if (!webhookSecret) throw new ApiError(503, 'INTERNAL_ERROR', 'Stripe webhooks are not configured');
    const parsed = verifyStripeWebhook(rawBody, signature, webhookSecret);
    if (!parsed.ok) throw new ApiError(401, 'UNAUTHORIZED', 'Invalid Stripe webhook signature');
    if (!parsed.providerOrderId) throw new ApiError(400, 'VALIDATION_ERROR', 'No subscription in event');
    if (parsed.type === 'customer.subscription.deleted') {
      return applyRemoteStatus(parsed.providerOrderId, 'CANCELED', {});
    }
    if (parsed.type === 'invoice.payment_failed') {
      // Stripe invoice events nest the subscription id; fetch it from payload when present.
      let evt: { data?: { object?: { subscription?: unknown } } };
      try {
        evt = JSON.parse(rawBody.toString('utf8')) as typeof evt;
      } catch {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid webhook payload');
      }
      const subId = evt.data?.object?.subscription;
      if (typeof subId !== 'string') throw new ApiError(400, 'VALIDATION_ERROR', 'No subscription in invoice event');
      return applyRemoteStatus(subId, 'PAST_DUE', {}, true);
    }
    if (parsed.type === 'customer.subscription.updated' || parsed.type === 'customer.subscription.created') {
      let evt: { data?: { object?: { status?: string; current_period_end?: number } } };
      try {
        evt = JSON.parse(rawBody.toString('utf8')) as typeof evt;
      } catch {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid webhook payload');
      }
      const st = evt.data?.object?.status;
      const map: Record<string, SubscriptionStatus> = {
        active: 'ACTIVE', trialing: 'TRIALING', past_due: 'PAST_DUE', canceled: 'CANCELED', unpaid: 'PAST_DUE',
      };
      const status = (st && map[st]) || 'PAST_DUE';
      const periodEnd = typeof evt.data?.object?.current_period_end === 'number'
        ? new Date(evt.data.object.current_period_end * 1000)
        : undefined;
      return applyRemoteStatus(parsed.providerOrderId, status, {}, false, periodEnd);
    }
    return { ignored: parsed.type ?? 'unknown' };
  },

  // ——— super-admin ———
  async listOrgs(search?: string) {
    const filter = search
      ? { $or: [{ name: { $regex: search, $options: 'i' } }, { slug: { $regex: search, $options: 'i' } }] }
      : {};
    const orgs = await Organization.find(filter).select('name slug status billingEmail subscription createdAt').sort({ createdAt: -1 }).limit(100).lean();
    const ids = orgs.map((o) => o._id);
    const [uCounts, bCounts] = await Promise.all([
      User.aggregate([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', n: { $sum: 1 } } }]),
      NFCBand.aggregate([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', n: { $sum: 1 } } }]),
    ]);
    const uMap = new Map(uCounts.map((r) => [String(r._id), r.n as number]));
    const bMap = new Map(bCounts.map((r) => [String(r._id), r.n as number]));
    return orgs.map((o) => ({
      ...o,
      usage: { users: uMap.get(String(o._id)) ?? 0, bands: bMap.get(String(o._id)) ?? 0 },
    }));
  },

  async setPlan(orgId: string, actorId: string, input: { plan?: string; status?: SubscriptionStatus; trialEndsAt?: string; periodEnd?: string; featureOverrides?: Record<string, boolean | null>; suspended?: boolean }) {
    const org = await Organization.findById(orgId);
    if (!org) throw new ApiError(404, 'NOT_FOUND', 'Organization not found');
    if (input.plan) {
      if (!(input.plan in PLANS)) throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown plan');
      const plan = PLANS[input.plan];
      const s = ensureSub(org);
      s.plan = plan.id;
      if (!input.status) s.status = plan.trialDays > 0 ? 'TRIALING' : 'ACTIVE';
      if (plan.trialDays > 0 && !s.trialEndsAt) {
        s.trialEndsAt = new Date(Date.now() + plan.trialDays * 24 * 3600 * 1000);
      }
    }
    if (input.status) ensureSub(org).status = input.status;
    if (input.trialEndsAt) ensureSub(org).trialEndsAt = new Date(input.trialEndsAt);
    if (input.periodEnd) ensureSub(org).periodEnd = new Date(input.periodEnd);
    if (input.featureOverrides) {
      const s = ensureSub(org) as unknown as { featureOverrides?: Map<string, boolean> };
      if (!s.featureOverrides || !(s.featureOverrides instanceof Map)) {
        s.featureOverrides = new Map<string, boolean>();
      }
      for (const [k, v] of Object.entries(input.featureOverrides)) {
        if (v === null) s.featureOverrides.delete(k);
        else s.featureOverrides.set(k, v);
      }
      org.markModified('subscription.featureOverrides');
    }
    if (input.suspended !== undefined) {
      org.status = input.suspended ? 'SUSPENDED' : 'ACTIVE';
    }
    await org.save();
    const cur = ensureSub(org);
    await billingAudit(String(org._id), actorId, 'BILLING_PLAN_SET', { plan: cur.plan, status: cur.status });
    emitToOrg(String(org._id), 'billing.updated', { plan: cur.plan, status: cur.status });
    // Mongoose Maps don't JSON-serialize — flatten for the response.
    const out = org.toObject() as Record<string, unknown>;
    const subOut = (out.subscription ?? {}) as Record<string, unknown>;
    const fo = subOut.featureOverrides;
    subOut.featureOverrides = fo instanceof Map ? Object.fromEntries(fo as Map<string, boolean>) : (fo ?? {});
    return { ...out, subscription: subOut };
  },
};

async function applyRemoteStatus(
  providerId: string,
  status: SubscriptionStatus,
  entity: Record<string, unknown> | undefined,
  grace = false,
  periodEnd?: Date,
) {
  const org = await Organization.findOne({ 'subscription.providerId': providerId });
  if (!org) throw new ApiError(404, 'NOT_FOUND', 'Subscription not found');
  const s = ensureSub(org);
  s.status = status;
  if (grace) s.graceUntil = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  else s.graceUntil = undefined;
  const end = periodEnd
    ?? (typeof entity?.current_end === 'number' ? new Date(entity.current_end * 1000) : undefined)
    ?? (typeof entity?.charge_at === 'number' ? new Date(entity.charge_at * 1000) : undefined);
  if (end) s.periodEnd = end;
  await org.save();
  emitToOrg(String(org._id), 'billing.updated', { status });
  return { organizationId: String(org._id), status };
}

async function billingAudit(organizationId: string, actorId: string, action: string, state: Record<string, unknown>): Promise<void> {
  await writeAudit({ organizationId, actorId, action, entityType: 'Organization', entityId: organizationId, newState: state });
}
