import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { Payment } from '../src/modules/wallets/wallet.models.js';
import { VisitorPass } from '../src/modules/visitors/visitor.model.js';

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

describe('expiry sweeps', () => {
  it('cancels stale top-up orders and expires old passes, leaving live rows alone', async () => {
    const past = new Date(Date.now() - 3600 * 1000);
    const future = new Date(Date.now() + 3600 * 1000);

    const stale = await Payment.create({
      organizationId: oid(fx.orgA.id),
      userId: oid(fx.operatorA.id),
      amountMinor: 5000,
      method: 'UPI',
      status: 'PENDING',
      reference: 'AD-STALE',
      actorId: oid(fx.adminA.id),
      provider: 'UPI',
      providerOrderId: 'ord_stale',
      idempotencyKey: 'sweep-stale-01',
      expiresAt: past,
    });
    const fresh = await Payment.create({
      organizationId: oid(fx.orgA.id),
      userId: oid(fx.operatorA.id),
      amountMinor: 5000,
      method: 'UPI',
      status: 'PENDING',
      reference: 'AD-FRESH',
      actorId: oid(fx.adminA.id),
      provider: 'UPI',
      providerOrderId: 'ord_fresh',
      idempotencyKey: 'sweep-fresh-01',
      expiresAt: future,
    });
    const oldPass = await VisitorPass.create({
      organizationId: oid(fx.orgA.id),
      token: 'a'.repeat(64),
      kind: 'VISITOR',
      name: 'Old Guest',
      validFrom: new Date(Date.now() - 7200 * 1000),
      validTo: past,
      maxUses: 1,
      createdBy: oid(fx.adminA.id),
    });

    const res = await request(app).post('/api/system/sweeps').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.topupsCancelled).toBe(1);
    expect(res.body.data.passesExpired).toBe(1);

    expect((await Payment.findById(stale._id).lean())?.status).toBe('CANCELLED');
    expect((await Payment.findById(fresh._id).lean())?.status).toBe('PENDING');
    expect((await VisitorPass.findById(oldPass._id).lean())?.status).toBe('EXPIRED');

    const denied = await request(app).post('/api/system/sweeps').set('Authorization', `Bearer ${fx.operatorA.token}`);
    expect(denied.status).toBe(403);
  });
});
