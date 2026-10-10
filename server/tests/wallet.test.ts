import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { NFCBand } from '../src/modules/bands/band.model.js';
import { NFCScan } from '../src/modules/nfc/nfcScan.model.js';
import { Wallet, WalletTransaction } from '../src/modules/wallets/wallet.models.js';

let fx: Fixture;
const oid = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);
const finAuth = () => `Bearer ${fx.adminA.token}`; // ADMIN has wallet.* + transactions.*

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

describe('wallet & transactions', () => {
  it('credit then debit moves the balance with a full ledger trail', async () => {
    const c = await request(app).post(`/api/wallets/${fx.operatorA.id}/credit`).set('Authorization', finAuth()).send({
      amountMinor: 10000, reason: 'Top-up', method: 'UPI', idempotencyKey: 'w-credit-01',
    });
    expect(c.status).toBe(201);
    expect(c.body.data.txn.balanceAfterMinor).toBe(10000);

    const d = await request(app).post(`/api/wallets/${fx.operatorA.id}/debit`).set('Authorization', finAuth()).send({
      amountMinor: 2500, reason: 'Cafeteria', idempotencyKey: 'w-debit-01',
    });
    expect(d.body.data.txn.balanceAfterMinor).toBe(7500);

    const w = await request(app).get(`/api/wallets/${fx.operatorA.id}`).set('Authorization', finAuth());
    expect(w.body.data.balanceMinor).toBe(7500);

    const list = await request(app).get(`/api/transactions?userId=${fx.operatorA.id}`).set('Authorization', finAuth());
    expect(list.body.data.total).toBe(2);
  });

  it('overdraft is rejected and leaves no successful ledger row', async () => {
    await request(app).post(`/api/wallets/${fx.operatorA.id}/credit`).set('Authorization', finAuth()).send({
      amountMinor: 500, idempotencyKey: 'w-credit-02',
    });
    const d = await request(app).post(`/api/wallets/${fx.operatorA.id}/debit`).set('Authorization', finAuth()).send({
      amountMinor: 501, idempotencyKey: 'w-debit-02',
    });
    expect(d.status).toBe(409);
    expect(d.body.code).toBe('INSUFFICIENT_BALANCE');
    expect(await WalletTransaction.countDocuments({ status: 'SUCCESS' })).toBe(1);
  });

  it('idempotent replay: same key twice moves money once', async () => {
    const body = { amountMinor: 3000, idempotencyKey: 'w-replay-1' };
    const first = await request(app).post(`/api/wallets/${fx.operatorA.id}/credit`).set('Authorization', finAuth()).send(body);
    const second = await request(app).post(`/api/wallets/${fx.operatorA.id}/credit`).set('Authorization', finAuth()).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.replay).toBe(true);
    expect(await WalletTransaction.countDocuments({ status: 'SUCCESS' })).toBe(1);
    expect((await Wallet.findOne({ userId: oid(fx.operatorA.id) }).lean())?.balanceMinor).toBe(3000);
  });

  it('concurrent double-submit settles to a single debit', async () => {
    await request(app).post(`/api/wallets/${fx.operatorA.id}/credit`).set('Authorization', finAuth()).send({
      amountMinor: 10000, idempotencyKey: 'w-conc-fund',
    });
    const body = { amountMinor: 4000, idempotencyKey: 'w-conc-1' };
    const [a, b] = await Promise.all([
      request(app).post(`/api/wallets/${fx.operatorA.id}/debit`).set('Authorization', finAuth()).send(body),
      request(app).post(`/api/wallets/${fx.operatorA.id}/debit`).set('Authorization', finAuth()).send(body),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect((await Wallet.findOne({ userId: oid(fx.operatorA.id) }).lean())?.balanceMinor).toBe(6000);
  });

  it('refund restores a debit exactly once', async () => {
    await request(app).post(`/api/wallets/${fx.operatorA.id}/credit`).set('Authorization', finAuth()).send({
      amountMinor: 5000, idempotencyKey: 'w-ref-fund',
    });
    const d = await request(app).post(`/api/wallets/${fx.operatorA.id}/debit`).set('Authorization', finAuth()).send({
      amountMinor: 2000, idempotencyKey: 'w-ref-deb',
    });
    const txnId = d.body.data.txn._id as string;
    const r = await request(app).post('/api/wallets/refund').set('Authorization', finAuth()).send({
      transactionId: txnId, reason: 'Double charge at kiosk', idempotencyKey: 'w-refund-01',
    });
    expect(r.status).toBe(201);
    expect((await Wallet.findOne({ userId: oid(fx.operatorA.id) }).lean())?.balanceMinor).toBe(5000);

    const dup = await request(app).post('/api/wallets/refund').set('Authorization', finAuth()).send({
      transactionId: txnId, reason: 'Again', idempotencyKey: 'w-refund-02',
    });
    expect(dup.status).toBe(409);
  });

  it('frozen wallets refuse debits; adjustments need a reason', async () => {
    await request(app).post(`/api/wallets/${fx.operatorA.id}/credit`).set('Authorization', finAuth()).send({
      amountMinor: 1000, idempotencyKey: 'w-frz-fund',
    });
    await request(app).post(`/api/wallets/${fx.operatorA.id}/freeze`).set('Authorization', finAuth());
    const d = await request(app).post(`/api/wallets/${fx.operatorA.id}/debit`).set('Authorization', finAuth()).send({
      amountMinor: 100, idempotencyKey: 'w-frz-deb',
    });
    expect(d.status).toBe(403);
    expect(d.body.code).toBe('WALLET_FROZEN');
    await request(app).post(`/api/wallets/${fx.operatorA.id}/unfreeze`).set('Authorization', finAuth());

    const bad = await request(app).post(`/api/wallets/${fx.operatorA.id}/adjust`).set('Authorization', finAuth()).send({
      deltaMinor: -100,
    });
    expect(bad.status).toBe(400); // reason is required for adjustments
  });

  it('cross-org wallet access is impossible; finance role gates mutations', async () => {
    const cross = await request(app).get(`/api/wallets/${fx.adminB.id}`).set('Authorization', finAuth());
    expect(cross.status).toBe(404);

    const opView = await request(app).get(`/api/wallets/${fx.operatorA.id}`).set('Authorization', `Bearer ${fx.operatorA.token}`);
    expect(opView.status).toBe(403); // OPERATOR has neither wallet.read nor transactions.read
  });

  it('NFC PAYMENT debits the wallet; broke wallets are DENIED', async () => {
    await NFCBand.create({
      organizationId: oid(fx.orgA.id),
      bandId: 'NF-PAY1',
      nfcUid: '04:AA:BB:CC:DD:01',
      type: 'STUDENT',
      status: 'ACTIVE',
      userId: oid(fx.operatorA.id),
      issuedAt: new Date(),
      activatedAt: new Date(),
      createdBy: oid(fx.adminA.id),
    });
    const poor = await request(app)
      .post('/api/nfc/scan')
      .set('Authorization', `Bearer ${fx.operatorA.token}`)
      .send({ nfcUid: '04:AA:BB:CC:DD:01', action: 'PAYMENT', amountMinor: 500, requestId: 'pay-0001' });
    expect(poor.body.data.result).toBe('DENIED');
    expect(poor.body.data.message).toMatch(/balance/i);

    await request(app).post(`/api/wallets/${fx.operatorA.id}/credit`).set('Authorization', finAuth()).send({
      amountMinor: 2000, idempotencyKey: 'w-pay-fund1',
    });
    // Age the denied scan out of the duplicate window so the funded retry re-evaluates.
    await NFCScan.updateOne({ requestId: 'pay-0001' }, { $set: { timestamp: new Date(Date.now() - 60000) } });
    const rich = await request(app)
      .post('/api/nfc/scan')
      .set('Authorization', `Bearer ${fx.operatorA.token}`)
      .send({ nfcUid: '04:AA:BB:CC:DD:01', action: 'PAYMENT', amountMinor: 500, requestId: 'pay-0002' });
    expect(rich.body.data.result).toBe('SUCCESS');
    expect(rich.body.data.walletTransaction).toBeTruthy();
    expect((await Wallet.findOne({ userId: oid(fx.operatorA.id) }).lean())?.balanceMinor).toBe(1500);
  });
});
