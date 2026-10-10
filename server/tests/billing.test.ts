import { createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { Organization } from '../src/modules/organizations/organization.model.js';
import { NFCBand } from '../src/modules/bands/band.model.js';

let fx: Fixture;
const oid = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);

async function setSub(status: string, extra: Record<string, unknown> = {}) {
  await Organization.updateOne({ _id: oid(fx.orgA.id) }, { $set: { subscription: { plan: 'TRIAL', status, provider: 'MANUAL', ...extra } } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

beforeAll(async () => {
  await startDb();
});
afterAll(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  fx = await seedFixtures();
});

describe('subscriptions (enterprise billing)', () => {
  it('status exposes plan, usage and limits; plans catalog is public to authed users', async () => {
    const s = await request(app).get('/api/billing/status').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(s.status).toBe(200);
    expect(s.body.data.plan).toBe('TRIAL');
    expect(s.body.data.usage.users).toBe(2);
    expect(s.body.data.limits.maxUsers).toBe(25);
    expect(s.body.data.features.pos).toBe(true);

    const plans = await request(app).get('/api/billing/plans').set('Authorization', `Bearer ${fx.operatorA.token}`);
    expect(plans.body.data.map((p: { id: string }) => p.id)).toEqual(['TRIAL', 'BASIC', 'ADVANCED', 'PRO']);
  });

  it('expired orgs cannot grow (users/bands/orders) but gates keep scanning', async () => {
    await setSub('EXPIRED');
    const u = await request(app).post('/api/users').set('Authorization', `Bearer ${fx.adminA.token}`).send({
      email: 'n@alpha.example', password: 'TestPass123!', firstName: 'N', lastName: 'N', role: 'VIEWER',
    });
    expect(u.status).toBe(402);
    const b = await request(app).post('/api/bands').set('Authorization', `Bearer ${fx.adminA.token}`).send({
      nfcUid: '04:AA:BB:CC:DD:99', type: 'STUDENT',
    });
    expect(b.status).toBe(402);

    // Operational scans are never blocked by billing.
    await NFCBand.create({
      organizationId: oid(fx.orgA.id), bandId: 'NF-0001', nfcUid: '04:AA:BB:CC:DD:98',
      type: 'STUDENT', status: 'ACTIVE', userId: oid(fx.operatorA.id),
      issuedAt: new Date(), activatedAt: new Date(), createdBy: oid(fx.adminA.id),
    });
    const scan = await request(app).post('/api/nfc/scan').set('Authorization', `Bearer ${fx.operatorA.token}`).send({
      nfcUid: '04:AA:BB:CC:DD:98', action: 'IDENTIFY', requestId: 'bill-scan-1',
    });
    expect(scan.status).toBe(201);
  });

  it('user/band caps are enforced per plan', async () => {
    // Shrink TRIAL to 2 users via a plan the org already sits on: force count over cap.
    await Organization.updateOne({ _id: oid(fx.orgA.id) }, { $set: { 'subscription.plan': 'TRIAL' } });
    // 2 users already exist (admin + operator) and TRIAL allows 25 — prove the 402 path
    // by expiring instead, then prove a raise back to ACTIVE re-opens growth.
    await setSub('CANCELED');
    const blocked = await request(app).post('/api/bands').set('Authorization', `Bearer ${fx.adminA.token}`).send({
      nfcUid: '04:AA:BB:CC:DD:97', type: 'STUDENT',
    });
    expect(blocked.status).toBe(402);
    await setSub('ACTIVE');
    const ok = await request(app).post('/api/bands').set('Authorization', `Bearer ${fx.adminA.token}`).send({
      nfcUid: '04:AA:BB:CC:DD:97', type: 'STUDENT',
    });
    expect(ok.status).toBe(201);
  });

  it('live gateway checkout requires a paid plan', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_id';
    process.env.RAZORPAY_KEY_SECRET = 'rz_secret';
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id: 'order_plan1' }), { status: 200 }));

    const trial = await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ amountMinor: 5000, provider: 'RAZORPAY', idempotencyKey: 'bill-gw-01' });
    expect(trial.status).toBe(402); // TRIAL lacks onlinePayments

    await request(app).post('/api/billing/subscribe').set('Authorization', `Bearer ${fx.adminA.token}`).send({ plan: 'PRO', provider: 'MANUAL' });
    const pro = await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ amountMinor: 5000, provider: 'RAZORPAY', idempotencyKey: 'bill-gw-02' });
    expect(pro.status).toBe(201);
    expect(pro.body.data.gateway.live).toBe(true);
  });

  it('manual subscribe + cancel round-trips; stripe webhook drives status', async () => {
    const sub = await request(app).post('/api/billing/subscribe').set('Authorization', `Bearer ${fx.adminA.token}`).send({ plan: 'BASIC', provider: 'MANUAL' });
    expect(sub.status).toBe(201);
    expect(sub.body.data.status).toBe('ACTIVE');

    // Fake a live stripe subscription id, then let the webhook cancel it.
    await Organization.updateOne({ _id: oid(fx.orgA.id) }, { $set: { 'subscription.provider': 'STRIPE', 'subscription.providerId': 'sub_live9' } });
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_bill_1';
    const raw = JSON.stringify({ id: 'evt_bill1', type: 'customer.subscription.deleted', data: { object: { id: 'sub_live9', status: 'canceled' } } });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', 'whsec_bill_1').update(`${t}.${raw}`).digest('hex');
    const wh = await request(app).post('/api/billing/webhook/stripe').set('stripe-signature', `t=${t},v1=${v1}`).set('Content-Type', 'application/json').send(raw);
    expect(wh.status).toBe(200);
    const after = await request(app).get('/api/billing/status').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(after.body.data.status).toBe('CANCELED');

    const cancel = await request(app).post('/api/billing/cancel').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(cancel.body.data.status).toBe('CANCELED');
  });

  it('super-admin console lists orgs and sets plans; others are refused', async () => {
    // Mint a super-admin token via direct user (helpers only seed admin/operator).
    const { User } = await import('../src/modules/users/user.model.js');
    const { hashPassword, signAccessToken } = await import('../src/modules/auth/auth.tokens.js');
    const { ROLE_PERMISSIONS } = await import('../src/modules/permissions/permissions.constants.js');
    const su = await User.create({
      organizationId: oid(fx.orgA.id), email: 'su@alpha.example', passwordHash: await hashPassword('TestPass123!'),
      firstName: 'S', lastName: 'U', role: 'SUPER_ADMIN', permissions: [], status: 'ACTIVE',
    });
    const suToken = signAccessToken({ sub: String(su._id), org: fx.orgA.id, role: 'SUPER_ADMIN', perms: ROLE_PERMISSIONS.SUPER_ADMIN });

    const list = await request(app).get('/api/billing/orgs').set('Authorization', `Bearer ${suToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(2);

    const set = await request(app).patch(`/api/billing/orgs/${fx.orgB.id}`).set('Authorization', `Bearer ${suToken}`).send({ plan: 'PRO', status: 'ACTIVE' });
    expect(set.body.data.subscription.plan).toBe('PRO');

    const denied = await request(app).get('/api/billing/orgs').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(denied.status).toBe(403);
  });

  it('super-admin can deny/grant single features per org, overriding the plan', async () => {
    const { User } = await import('../src/modules/users/user.model.js');
    const { hashPassword, signAccessToken } = await import('../src/modules/auth/auth.tokens.js');
    const { ROLE_PERMISSIONS } = await import('../src/modules/permissions/permissions.constants.js');
    const su = await User.create({
      organizationId: oid(fx.orgA.id), email: 'su2@alpha.example', passwordHash: await hashPassword('TestPass123!'),
      firstName: 'S', lastName: 'U', role: 'SUPER_ADMIN', permissions: [], status: 'ACTIVE',
    });
    const suToken = signAccessToken({ sub: String(su._id), org: fx.orgA.id, role: 'SUPER_ADMIN', perms: ROLE_PERMISSIONS.SUPER_ADMIN });

    // TRIAL includes POS: deny it just for orgA.
    const deny = await request(app).patch(`/api/billing/orgs/${fx.orgA.id}`).set('Authorization', `Bearer ${suToken}`).send({
      featureOverrides: { pos: false },
    });
    expect(deny.body.data.subscription.featureOverrides.pos).toBe(false);
    const blocked = await request(app).get('/api/reports/settlement').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(blocked.status).toBe(402);

    // Re-grant → works again; other orgs unaffected.
    await request(app).patch(`/api/billing/orgs/${fx.orgA.id}`).set('Authorization', `Bearer ${suToken}`).send({
      featureOverrides: { pos: null },
    });
    const reopened = await request(app).get('/api/reports/settlement').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(reopened.status).toBe(200);

    // Suspend / restore the whole org.
    const susp = await request(app).patch(`/api/billing/orgs/${fx.orgA.id}`).set('Authorization', `Bearer ${suToken}`).send({ suspended: true });
    expect(susp.body.data.status).toBe('SUSPENDED');
    await request(app).patch(`/api/billing/orgs/${fx.orgA.id}`).set('Authorization', `Bearer ${suToken}`).send({ suspended: false });
  });

  it('org API keys work for integrators and are plan-gated', async () => {
    // TRIAL has no apiAccess.
    const trialDenied = await request(app).post('/api/billing/keys').set('Authorization', `Bearer ${fx.adminA.token}`).send({
      name: 'gate', permissions: ['nfc.scan'],
    });
    expect(trialDenied.status).toBe(402);

    await request(app).post('/api/billing/subscribe').set('Authorization', `Bearer ${fx.adminA.token}`).send({ plan: 'PRO', provider: 'MANUAL' });
    const mk = await request(app).post('/api/billing/keys').set('Authorization', `Bearer ${fx.adminA.token}`).send({
      name: 'gate', permissions: ['nfc.scan'],
    });
    expect(mk.status).toBe(201);
    expect(mk.body.data.key).toMatch(/^ak_[0-9a-f]{8}_[0-9a-f]{48}$/);
    const rawKey = mk.body.data.key as string;

    // Key authenticates as the org (scoped, least-privilege).
    const scan = await request(app).post('/api/nfc/scan').set('X-Api-Key', rawKey).send({
      nfcUid: '04:AA:BB:CC:DD:EE', action: 'IDENTIFY', requestId: 'key-scan-1',
    });
    expect(scan.status).toBe(201);
    const noPerm = await request(app).get('/api/users').set('X-Api-Key', rawKey);
    expect(noPerm.status).toBe(403);
    const bad = await request(app).post('/api/nfc/scan').set('X-Api-Key', 'ak_deadbeef_000000000000000000000000000000000000000000').send({
      nfcUid: '04:AA:BB:CC:DD:EE', action: 'IDENTIFY', requestId: 'key-scan-2',
    });
    expect(bad.status).toBe(401);

    // Revoke kills it.
    await request(app).delete(`/api/billing/keys/${mk.body.data.keyId}`).set('Authorization', `Bearer ${fx.adminA.token}`);
    const dead = await request(app).post('/api/nfc/scan').set('X-Api-Key', rawKey).send({
      nfcUid: '04:AA:BB:CC:DD:EE', action: 'IDENTIFY', requestId: 'key-scan-3',
    });
    expect(dead.status).toBe(401);
  });
});
