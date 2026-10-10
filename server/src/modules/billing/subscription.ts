import { ApiError } from '../../utils/errors.js';
import { Organization } from '../organizations/organization.model.js';
import { User } from '../users/user.model.js';
import { NFCBand } from '../bands/band.model.js';
import { PLANS, planOf, subscriptionWritable, type Plan, type PlanFeatures, type SubscriptionStatus } from './plans.js';

export interface OrgSubscription {
  plan: string;
  status: SubscriptionStatus;
  trialEndsAt?: Date;
  periodEnd?: Date;
  graceUntil?: Date;
  provider: string;
}

export async function getOrgSubscription(organizationId: string): Promise<OrgSubscription> {
  const org = await Organization.findById(organizationId).select('subscription').lean();
  const sub = (org?.subscription ?? {}) as Partial<OrgSubscription>;
  return {
    plan: typeof sub.plan === 'string' ? sub.plan : 'TRIAL',
    status: (sub.status as SubscriptionStatus) ?? 'TRIALING',
    trialEndsAt: sub.trialEndsAt,
    periodEnd: sub.periodEnd,
    graceUntil: sub.graceUntil,
    provider: sub.provider ?? 'MANUAL',
  };
}

/** Growth actions (users, bands, orders) require a writable subscription. Operations (scans/charges) never call this. */
export async function assertSubscriptionWritable(organizationId: string): Promise<void> {
  const sub = await getOrgSubscription(organizationId);
  const check = subscriptionWritable(sub);
  if (!check.ok) throw new ApiError(402, 'FORBIDDEN', check.reason ?? 'Subscription does not allow changes');
}

export async function assertWithinLimit(organizationId: string, kind: 'users' | 'bands'): Promise<void> {
  const sub = await getOrgSubscription(organizationId);
  const plan = planOf(sub.plan);
  if (kind === 'users') {
    const count = await User.countDocuments({ organizationId });
    if (count >= plan.limits.maxUsers) {
      throw new ApiError(402, 'FORBIDDEN', `User limit reached for the ${plan.name} plan (${plan.limits.maxUsers}) — upgrade to add more`);
    }
    return;
  }
  const count = await NFCBand.countDocuments({ organizationId });
  if (count >= plan.limits.maxBands) {
    throw new ApiError(402, 'FORBIDDEN', `Band limit reached for the ${plan.name} plan (${plan.limits.maxBands}) — upgrade to add more`);
  }
}

export async function assertFeature(organizationId: string, feature: keyof PlanFeatures): Promise<void> {
  const effective = await effectiveFeatures(organizationId);
  if (!effective[feature]) {
    const sub = await getOrgSubscription(organizationId);
    const plan = planOf(sub.plan);
    throw new ApiError(402, 'FORBIDDEN', `The ${plan.name} plan does not include this feature — upgrade or ask your administrator`);
  }
}

/** Plan matrix with super-admin per-org overrides applied. Also returned by billing status. */
export async function effectiveFeatures(organizationId: string): Promise<PlanFeatures> {
  const org = await Organization.findById(organizationId).select('subscription.plan subscription.featureOverrides').lean();
  const plan = planOf((org?.subscription as { plan?: string } | undefined)?.plan);
  const raw = (org?.subscription as { featureOverrides?: unknown } | undefined)?.featureOverrides;
  const overrides: Record<string, unknown> =
    raw instanceof Map ? Object.fromEntries(raw as Map<string, unknown>) : ((raw as Record<string, unknown>) ?? {});
  const out = { ...plan.features };
  for (const key of Object.keys(out) as (keyof PlanFeatures)[]) {
    if (typeof overrides[key] === 'boolean') out[key] = overrides[key] as boolean;
  }
  return out;
}

export async function getOverrides(organizationId: string): Promise<Record<string, boolean>> {
  const org = await Organization.findById(organizationId).select('subscription.featureOverrides').lean();
  const raw = (org?.subscription as { featureOverrides?: unknown } | undefined)?.featureOverrides;
  if (raw instanceof Map) return Object.fromEntries(raw as Map<string, boolean>);
  return ((raw as Record<string, boolean>) ?? {});
}

export function planCatalog(): { id: string; name: string; priceMinor: number; trialDays: number; limits: Plan['limits']; features: Plan['features'] }[] {
  return Object.values(PLANS).map((p) => ({ id: p.id, name: p.name, priceMinor: p.priceMinor, trialDays: p.trialDays, limits: p.limits, features: p.features }));
}
