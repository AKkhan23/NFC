import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { NFCBand } from '../src/modules/bands/band.model.js';
import { Wallet } from '../src/modules/wallets/wallet.models.js';

let fx: Fixture;
const oid = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);

async function fundedBand(uid: string, balanceMinor: number): Promise<void> {
  await NFCBand.create({
    organizationId: oid(fx.orgA.id),
    bandId: `NF-${uid.slice(-4)}`,
    nfcUid: uid,
    type: 'STUDENT',
    status: 'ACTIVE',
    userId: oid(fx.operatorA.id),
    issuedAt: new Date(),
    activatedAt: new Date(),
    createdBy: oid(fx.adminA.id),
  });
  await request(app).post(`/api/wallets/${fx.operatorA.id}/credit`).set('Authorization', `Bearer ${fx.adminA.token}`).send({
    amountMinor: balanceMinor, idempotencyKey: `pos-fund-${uid.slice(-4)}`,
  });
}

async function pay(uid: string, amountMinor: number, requestId: string) {
  return request(app).post('/api/nfc/scan').set('Authorization', `Bearer ${fx.operatorA.token}`).send({
    nfcUid: uid, action: 'PAYMENT', amountMinor, requestId,
  });
}

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

describe('POS settlement + void', () => {
  it('settlement aggregates today’s sales in org timezone; counter staff may read', async () => {
    await request(app).put('/api/settings').set('Authorization', `Bearer ${fx.adminA.token}`).send({ timezone: 'Asia/Kolkata' });
    await fundedBand('04:AA:BB:CC:DD:11', 10000);
    const p1 = await pay('04:AA:BB:CC:DD:11', 2500, 'pos-pay-01');
    expect(p1.body.data.result).toBe('SUCCESS');

    const op = await request(app).get('/api/reports/settlement').set('Authorization', `Bearer ${fx.operatorA.token}`);
    expect(op.status).toBe(200); // OPERATOR via nfc.scan
    expect(op.body.data.timezone).toBe('Asia/Kolkata');
    expect(op.body.data.salesCount).toBe(1);
    expect(op.body.data.salesVolumeMinor).toBe(2500);
    expect(op.body.data.recent).toHaveLength(1);
    expect(op.body.data.recent[0].amountMinor).toBe(2500);
    expect(op.body.data.bounds.from).toBeTruthy();

    const unauth = await request(app).get('/api/reports/settlement');
    expect(unauth.status).toBe(401);

    const bad = await request(app).get('/api/reports/settlement?date=tomorrow').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(bad.status).toBe(400);
  });

  it('void restores a mistaken tap exactly once; non-payments and old days are refused', async () => {
    await fundedBand('04:AA:BB:CC:DD:22', 10000);
    const p = await pay('04:AA:BB:CC:DD:22', 3000, 'pos-pay-02');
    const txnId = p.body.data.walletTransaction._id as string;

    const v = await request(app).post('/api/pos/void').set('Authorization', `Bearer ${fx.operatorA.token}`).send({ transactionId: txnId });
    expect(v.status).toBe(201);
    expect((await Wallet.findOne({ userId: oid(fx.operatorA.id) }).lean())?.balanceMinor).toBe(10000);

    const dup = await request(app).post('/api/pos/void').set('Authorization', `Bearer ${fx.operatorA.token}`).send({ transactionId: txnId });
    expect(dup.status).toBe(409); // already refunded

    // Manual (non-NFC) debits must use the finance flow.
    const d = await request(app).post(`/api/wallets/${fx.operatorA.id}/debit`).set('Authorization', `Bearer ${fx.adminA.token}`).send({
      amountMinor: 500, reason: 'Cafeteria', idempotencyKey: 'pos-manual-01',
    });
    const refused = await request(app).post('/api/pos/void').set('Authorization', `Bearer ${fx.operatorA.token}`).send({
      transactionId: d.body.data.txn._id as string,
    });
    expect(refused.status).toBe(403);
  });

  it('cross-org void is impossible; finance-only users cannot void at the counter', async () => {
    await fundedBand('04:AA:BB:CC:DD:33', 10000);
    const p = await pay('04:AA:BB:CC:DD:33', 1000, 'pos-pay-03');
    const txnId = p.body.data.walletTransaction._id as string;

    const cross = await request(app).post('/api/pos/void').set('Authorization', `Bearer ${fx.adminB.token}`).send({ transactionId: txnId });
    expect(cross.status).toBe(404);

    // VIEWER has reports.read (can see settlement) but not nfc.scan (cannot void).
    const mk = await request(app).post('/api/users').set('Authorization', `Bearer ${fx.adminA.token}`).send({
      email: 'viewer@alpha.example', password: 'TestPass123!', firstName: 'V', lastName: 'W', role: 'VIEWER',
    });
    expect(mk.status).toBe(201);
    const login = await request(app).post('/api/auth/login').send({ email: 'viewer@alpha.example', password: 'TestPass123!' });
    const vToken = login.body.data.accessToken as string;
    const canSee = await request(app).get('/api/reports/settlement').set('Authorization', `Bearer ${vToken}`);
    expect(canSee.status).toBe(200);
    const cannotVoid = await request(app).post('/api/pos/void').set('Authorization', `Bearer ${vToken}`).send({ transactionId: txnId });
    expect(cannotVoid.status).toBe(403);
  });

  it('posMenu settings round-trip for the canteen catalog', async () => {
    const put = await request(app).put('/api/settings').set('Authorization', `Bearer ${fx.adminA.token}`).send({
      posMenu: [{ name: 'Samosa', priceMinor: 2000 }, { name: 'Chai', priceMinor: 1000 }],
    });
    expect(put.body.data.settings.posMenu).toHaveLength(2);
    const get = await request(app).get('/api/settings').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(get.body.data.settings.posMenu[0].name).toBe('Samosa');
    const bad = await request(app).put('/api/settings').set('Authorization', `Bearer ${fx.adminA.token}`).send({
      posMenu: [{ name: '', priceMinor: -5 }],
    });
    expect(bad.status).toBe(400);
  });
});
