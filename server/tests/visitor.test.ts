import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';

let fx: Fixture;

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

describe('visitor & day-qr passes', () => {
  it('issue -> check-in -> single-use enforced', async () => {
    const created = await request(app)
      .post('/api/visitors')
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ kind: 'VISITOR', name: 'Guest One', purpose: 'Parent meeting', maxUses: 1 });
    expect(created.status).toBe(201);
    const token = created.body.data.token as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    // The QR-able gate link must ship with the create response (never "undefined").
    expect(created.body.data.checkinUrl).toBe(`/v/${token}`);

    const in1 = await request(app)
      .post('/api/visitors/check-in')
      .set('Authorization', `Bearer ${fx.operatorA.token}`)
      .send({ token });
    expect(in1.status).toBe(201);

    const in2 = await request(app)
      .post('/api/visitors/check-in')
      .set('Authorization', `Bearer ${fx.operatorA.token}`)
      .send({ token });
    expect(in2.status).toBe(409);
  });

  it('revoked passes are refused; public verify works without auth', async () => {
    const created = await request(app)
      .post('/api/visitors')
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ kind: 'DAY_QR', name: 'Forgot band', userId: fx.operatorA.id, maxUses: 2 });
    expect(created.status).toBe(201);
    const { _id, token } = created.body.data as { _id: string; token: string };

    const pub = await request(app).get(`/api/v/${token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.valid).toBe(true);

    const revoke = await request(app)
      .post(`/api/visitors/${_id}/revoke`)
      .set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(revoke.status).toBe(200);

    const denied = await request(app)
      .post('/api/visitors/check-in')
      .set('Authorization', `Bearer ${fx.operatorA.token}`)
      .send({ token });
    expect(denied.status).toBe(409);
  });

  it('cross-org check-in cannot consume another org pass', async () => {
    const created = await request(app)
      .post('/api/visitors')
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ kind: 'VISITOR', name: 'X', maxUses: 1 });
    const token = created.body.data.token as string;
    const cross = await request(app)
      .post('/api/visitors/check-in')
      .set('Authorization', `Bearer ${fx.adminB.token}`)
      .send({ token });
    expect(cross.status).toBe(404);
  });
});
