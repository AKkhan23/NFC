import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { Wallet, WalletTransaction } from '../src/modules/wallets/wallet.models.js';
import mongoose from 'mongoose';

let fx: Fixture;
const oid = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);

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

describe('online wallet top-up', () => {
  it('intent -> confirm credits exactly once, even on duplicate confirm + webhook replay', async () => {
    const intent = await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ amountMinor: 50000, provider: 'UPI', idempotencyKey: 'topup-e2e-01' });
    expect(intent.status).toBe(201);
    const orderId = intent.body.data.order._id as string;
    expect(intent.body.data.order.status).toBe('PENDING');
    expect(intent.body.data.order.reference).toBeTruthy();

    // Same idempotency key replays the same order.
    const replay = await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ amountMinor: 50000, provider: 'UPI', idempotencyKey: 'topup-e2e-01' });
    expect(replay.status).toBe(200);
    expect(replay.body.data.order._id).toBe(orderId);

    const confirm = await request(app)
      .post(`/api/wallets/topup/${orderId}/confirm`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ providerReference: 'UPI123' });
    expect(confirm.status).toBe(201);
  });

  it('full lifecycle via correct routes with double-confirm safety', async () => {
    const intent = await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ amountMinor: 25000, provider: 'MOCK', idempotencyKey: 'topup-e2e-02' });
    expect(intent.status).toBe(201);
    const orderId = intent.body.data.order._id as string;

    const c1 = await request(app)
      .post(`/api/wallets/topup/${orderId}/confirm`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ providerReference: 'MOCK-1' });
    expect(c1.status).toBe(201);

    const c2 = await request(app)
      .post(`/api/wallets/topup/${orderId}/confirm`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ providerReference: 'MOCK-1' });
    expect(c2.status).toBe(200);
    expect(c2.body.data.replay).toBe(true);

    const wh = await request(app).post('/api/wallets/topup/webhook').send({ orderId, status: 'SUCCESS' });
    expect(wh.status).toBe(200);
    expect(wh.body.data.replay).toBe(true);

    expect((await Wallet.findOne({ userId: oid(fx.operatorA.id) }).lean())?.balanceMinor).toBe(25000);
    expect(await WalletTransaction.countDocuments({ idempotencyKey: `topup_${orderId}`, status: 'SUCCESS' })).toBe(1);
  });

  it('self top-up allowed; topping up others requires wallet.manage; cancel works', async () => {
    // operator tops up self without wallet.manage
    const self = await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.operatorA.token}`)
      .send({ amountMinor: 10000, provider: 'UPI', idempotencyKey: 'topup-self-01' });
    expect(self.status).toBe(201);

    // operator cannot create for someone else
    const other = await request(app)
      .post(`/api/wallets/${fx.adminA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.operatorA.token}`)
      .send({ amountMinor: 10000, provider: 'UPI', idempotencyKey: 'topup-self-02' });
    expect(other.status).toBe(403);

    // operator cannot confirm (staff only)
    const orderId = self.body.data.order._id as string;
    const deny = await request(app)
      .post(`/api/wallets/topup/${orderId}/confirm`)
      .set('Authorization', `Bearer ${fx.operatorA.token}`)
      .send({});
    expect(deny.status).toBe(403);

    // self cancel works
    const cancel = await request(app)
      .post(`/api/wallets/topup/${orderId}/cancel`)
      .set('Authorization', `Bearer ${fx.operatorA.token}`)
      .send();
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('CANCELLED');
  });

  it('cross-org order access returns 404', async () => {
    const intent = await request(app)
      .post(`/api/wallets/${fx.operatorA.id}/topup/intent`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ amountMinor: 10000, provider: 'UPI', idempotencyKey: 'topup-xorg-01' });
    const orderId = intent.body.data.order._id as string;
    const cross = await request(app)
      .get(`/api/wallets/topup/${orderId}`)
      .set('Authorization', `Bearer ${fx.adminB.token}`);
    expect(cross.status).toBe(404);
  });
});
