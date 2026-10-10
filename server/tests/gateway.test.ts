import { createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { Wallet } from '../src/modules/wallets/wallet.models.js';
import { verifyRazorpayCallback, verifyStripeWebhook } from '../src/modules/wallets/gateway.js';

let fx: Fixture;
const oid = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);

/** Live gateway checkout is a paid-plan feature — upgrade before live intents. */
async function upgradeToPro(): Promise<void> {
  await request(app).post('/api/billing/subscribe').set('Authorization', `Bearer ${fx.adminA.token}`).send({ plan: 'PRO', provider: 'MANUAL' });
}

const RZ_SECRET = 'rz_test_secret_123';
const ST_SECRET = 'whsec_test_stripe_456';

function stubFetch(handler: (url: string) => unknown): void {
  vi.stubGlobal('fetch', async (url: unknown) => new Response(JSON.stringify(handler(String(url))), { status: 200 }));
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

describe('gateway signatures (pure)', () => {
  it('razorpay callback HMAC verifies and rejects tampering', () => {
    const orderId = 'order_ABC';
    const paymentId = 'pay_XYZ';
    const sig = createHmac('sha256', RZ_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
    expect(verifyRazorpayCallback({ orderId, paymentId, signature: sig }, RZ_SECRET)).toBe(true);
    expect(verifyRazorpayCallback({ orderId, paymentId, signature: sig }, 'wrong')).toBe(false);
    expect(verifyRazorpayCallback({ orderId, paymentId: 'pay_OTHER', signature: sig }, RZ_SECRET)).toBe(false);
  });

  it('stripe webhook HMAC verifies, rejects tampering and stale timestamps', () => {
    const raw = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', amount: 5000 } } }));
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', ST_SECRET).update(`${t}.${raw.toString('utf8')}`).digest('hex');
    const good = verifyStripeWebhook(raw, `t=${t},v1=${v1}`, ST_SECRET);
    expect(good.ok).toBe(true);
    expect(good.providerOrderId).toBe('pi_1');
    expect(verifyStripeWebhook(raw, `t=${t},v1=${'0'.repeat(64)}`, ST_SECRET).ok).toBe(false);
    const oldT = t - 3600;
    const oldV1 = createHmac('sha256', ST_SECRET).update(`${oldT}.${raw.toString('utf8')}`).digest('hex');
    expect(verifyStripeWebhook(raw, `t=${oldT},v1=${oldV1}`, ST_SECRET).ok).toBe(false);
  });
});

describe('live gateway top-up', () => {
  it('config endpoint advertises only wired providers', async () => {
    const anon = await request(app).get('/api/wallets/topup/config').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(anon.status).toBe(200);
    expect(anon.body.data.razorpay.enabled).toBe(false);
    expect(anon.body.data.stripe.enabled).toBe(false);

    process.env.RAZORPAY_KEY_ID = 'rzp_test_id';
    process.env.RAZORPAY_KEY_SECRET = RZ_SECRET;
    const wired = await request(app).get('/api/wallets/topup/config').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(wired.body.data.razorpay.enabled).toBe(true);
    expect(wired.body.data.razorpay.keyId).toBe('rzp_test_id');
    expect(wired.body.data.stripe.enabled).toBe(false); // secret key never leaks
    expect(JSON.stringify(wired.body.data)).not.toContain(RZ_SECRET);
  });

  it('razorpay intent -> checkout callback credits exactly once', async () => {
    await upgradeToPro();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_id';
    process.env.RAZORPAY_KEY_SECRET = RZ_SECRET;
    stubFetch(() => ({ id: 'order_live123', amount: 50000, currency: 'INR' }));

    const intent = await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ amountMinor: 50000, provider: 'RAZORPAY', idempotencyKey: 'gw-rz-01' });
    expect(intent.status).toBe(201);
    expect(intent.body.data.gateway.live).toBe(true);
    expect(intent.body.data.gateway.providerOrderId).toBe('order_live123');
    expect(intent.body.data.order.providerOrderId).toBe('order_live123');

    const paymentId = 'pay_live999';
    const signature = createHmac('sha256', RZ_SECRET).update(`order_live123|${paymentId}`).digest('hex');
    const cb = await request(app).post('/api/wallets/topup/webhook/razorpay/callback').send({
      razorpay_order_id: 'order_live123', razorpay_payment_id: paymentId, razorpay_signature: signature,
    });
    expect(cb.status).toBe(200);
    expect((await Wallet.findOne({ userId: oid(fx.operatorA.id) }).lean())?.balanceMinor).toBe(50000);

    const replay = await request(app).post('/api/wallets/topup/webhook/razorpay/callback').send({
      razorpay_order_id: 'order_live123', razorpay_payment_id: paymentId, razorpay_signature: signature,
    });
    expect(replay.body.data.replay).toBe(true);
    expect((await Wallet.findOne({ userId: oid(fx.operatorA.id) }).lean())?.balanceMinor).toBe(50000);

    const bad = await request(app).post('/api/wallets/topup/webhook/razorpay/callback').send({
      razorpay_order_id: 'order_live123', razorpay_payment_id: paymentId, razorpay_signature: '0'.repeat(64),
    });
    expect(bad.status).toBe(401);
  });

  it('razorpay server event settles and enforces the amount', async () => {
    await upgradeToPro();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_id';
    process.env.RAZORPAY_KEY_SECRET = RZ_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = 'rzwhsec_1';
    stubFetch(() => ({ id: 'order_evt1', amount: 20000, currency: 'INR' }));

    await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ amountMinor: 20000, provider: 'RAZORPAY', idempotencyKey: 'gw-rz-02' });

    const raw = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_evt1', order_id: 'order_evt1', amount: 20000 } } },
    });
    const sig = createHmac('sha256', 'rzwhsec_1').update(raw).digest('hex');
    const ok = await request(app).post('/api/wallets/topup/webhook/razorpay').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw);
    expect(ok.status).toBe(200);
    expect((await Wallet.findOne({ userId: oid(fx.operatorA.id) }).lean())?.balanceMinor).toBe(20000);

    const tampered = await request(app).post('/api/wallets/topup/webhook/razorpay').set('x-razorpay-signature', '0'.repeat(64)).set('Content-Type', 'application/json').send(raw);
    expect(tampered.status).toBe(401);
  });

  it('stripe intent -> webhook credits; amount mismatch is refused', async () => {
    await upgradeToPro();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = ST_SECRET;
    stubFetch(() => ({ id: 'pi_live1', client_secret: 'cs_live1', amount: 30000 }));

    const intent = await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ amountMinor: 30000, provider: 'STRIPE', idempotencyKey: 'gw-st-01' });
    expect(intent.status).toBe(201);
    expect(intent.body.data.gateway.live).toBe(true);
    expect(intent.body.data.gateway.clientSecret).toBe('cs_live1');

    const raw = JSON.stringify({
      id: 'evt_st1', type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_live1', amount: 30000, latest_charge: 'ch_1' } },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', ST_SECRET).update(`${t}.${raw}`).digest('hex');
    const ok = await request(app).post('/api/wallets/topup/webhook/stripe').set('stripe-signature', `t=${t},v1=${v1}`).set('Content-Type', 'application/json').send(raw);
    expect(ok.status).toBe(200);
    expect((await Wallet.findOne({ userId: oid(fx.operatorA.id) }).lean())?.balanceMinor).toBe(30000);

    // Underpayment against the same intent shape is refused (fresh order, wrong amount).
    stubFetch(() => ({ id: 'pi_live2', client_secret: 'cs_live2', amount: 30000 }));
    await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ amountMinor: 30000, provider: 'STRIPE', idempotencyKey: 'gw-st-02' });
    const rawShort = JSON.stringify({
      id: 'evt_st2', type: 'payment_intent.succeeded', data: { object: { id: 'pi_live2', amount: 100 } },
    });
    const t2 = Math.floor(Date.now() / 1000);
    const v2 = createHmac('sha256', ST_SECRET).update(`${t2}.${rawShort}`).digest('hex');
    const short = await request(app).post('/api/wallets/topup/webhook/stripe').set('stripe-signature', `t=${t2},v1=${v2}`).set('Content-Type', 'application/json').send(rawShort);
    expect(short.status).toBe(400);
    expect((await Wallet.findOne({ userId: oid(fx.operatorA.id) }).lean())?.balanceMinor).toBe(30000);
  });

  it('unreachable gateway fails the intent loudly instead of stranding money', async () => {
    await upgradeToPro();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_id';
    process.env.RAZORPAY_KEY_SECRET = RZ_SECRET;
    vi.stubGlobal('fetch', async () => {
      throw new Error('network down');
    });
    const res = await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ amountMinor: 10000, provider: 'RAZORPAY', idempotencyKey: 'gw-down-01' });
    expect(res.status).toBe(502);
  });
});
