/**
 * Enterprise plan catalog: free Trial + three paid tiers.
 * Prices in INR minor units (paise) per month.
 *
 * Feature flags cover the premium product surface. Core operations
 * (dashboard, users/bands within caps, scanner, attendance, access,
 * manual wallet) are always on — gates never stop working over billing.
 */
export interface PlanLimits {
  maxUsers: number;
  maxBands: number;
  maxLocations: number;
  maxEventsPerMonth: number;
}

export interface PlanFeatures {
  /** Live Razorpay/Stripe checkout for wallet top-ups. */
  onlinePayments: boolean;
  /** Canteen POS charging + settlement. */
  pos: boolean;
  /** Visitor passes + day-QR fallback. */
  visitors: boolean;
  /** Events module. */
  events: boolean;
  /** Tap profiles / public cards. */
  tapProfiles: boolean;
  /** CSV report exports. */
  reportsExport: boolean;
  /** API access for integrators. */
  apiAccess: boolean;
}

export type FeatureKey = keyof PlanFeatures;

export const FEATURES: { key: FeatureKey; label: string; blurb: string }[] = [
  { key: 'onlinePayments', label: 'Live gateway top-ups', blurb: 'Razorpay/Stripe checkout for wallets' },
  { key: 'pos', label: 'Canteen POS', blurb: 'Counter charging + settlement' },
  { key: 'visitors', label: 'Visitors & Day-QR', blurb: 'Gate passes + QR fallback' },
  { key: 'events', label: 'Events', blurb: 'Event creation + capacity check-in' },
  { key: 'tapProfiles', label: 'Tap profiles', blurb: 'Public tap cards + vCards' },
  { key: 'reportsExport', label: 'CSV exports', blurb: 'Downloadable reports' },
  { key: 'apiAccess', label: 'API access', blurb: 'Integrator API surface' },
];

export interface Plan {
  id: string;
  name: string;
  priceMinor: number;
  trialDays: number;
  limits: PlanLimits;
  features: PlanFeatures;
}

export const PLANS: Record<string, Plan> = {
  TRIAL: {
    id: 'TRIAL',
    name: 'Trial',
    priceMinor: 0,
    trialDays: 14,
    limits: { maxUsers: 25, maxBands: 100, maxLocations: 3, maxEventsPerMonth: 5 },
    features: { onlinePayments: false, pos: true, visitors: true, events: true, tapProfiles: true, reportsExport: false, apiAccess: false },
  },
  BASIC: {
    id: 'BASIC',
    name: 'Basic',
    priceMinor: 199900,
    trialDays: 0,
    limits: { maxUsers: 100, maxBands: 500, maxLocations: 5, maxEventsPerMonth: 20 },
    features: { onlinePayments: false, pos: true, visitors: true, events: true, tapProfiles: true, reportsExport: true, apiAccess: false },
  },
  ADVANCED: {
    id: 'ADVANCED',
    name: 'Advanced',
    priceMinor: 499900,
    trialDays: 0,
    limits: { maxUsers: 1000, maxBands: 5000, maxLocations: 25, maxEventsPerMonth: 200 },
    features: { onlinePayments: true, pos: true, visitors: true, events: true, tapProfiles: true, reportsExport: true, apiAccess: false },
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    priceMinor: 1499900,
    trialDays: 0,
    limits: { maxUsers: 100000, maxBands: 500000, maxLocations: 1000, maxEventsPerMonth: 10000 },
    features: { onlinePayments: true, pos: true, visitors: true, events: true, tapProfiles: true, reportsExport: true, apiAccess: true },
  },
};

export type PlanId = keyof typeof PLANS;

export function planOf(id: unknown): Plan {
  if (typeof id === 'string' && id in PLANS) return PLANS[id];
  return PLANS.TRIAL;
}

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

export interface SubscriptionState {
  plan: string;
  status: SubscriptionStatus;
  trialEndsAt?: Date;
  periodEnd?: Date;
  graceUntil?: Date;
}

/** Growth actions stay writable while trialing/active/in-grace; operations (scans/charges) never block. */
export function subscriptionWritable(sub: SubscriptionState, now = new Date()): { ok: boolean; reason?: string } {
  if (sub.status === 'ACTIVE') return { ok: true };
  if (sub.status === 'TRIALING') {
    if (!sub.trialEndsAt || new Date(sub.trialEndsAt) >= now) return { ok: true };
    return { ok: false, reason: 'Trial has ended — choose a plan to keep adding users, bands and orders.' };
  }
  if (sub.status === 'PAST_DUE') {
    if (sub.graceUntil && new Date(sub.graceUntil) >= now) return { ok: true };
    return { ok: false, reason: 'Subscription payment is overdue — update billing to resume changes.' };
  }
  if (sub.status === 'CANCELED') {
    // Paid through the end of the period: keep working until then.
    if (sub.periodEnd && new Date(sub.periodEnd) >= now) return { ok: true };
    return { ok: false, reason: 'Subscription is canceled — choose a plan to resume changes.' };
  }
  return { ok: false, reason: `Subscription is ${sub.status.toLowerCase()} — contact billing.` };
}
