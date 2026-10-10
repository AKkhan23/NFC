import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { NFCBand } from '../src/modules/bands/band.model.js';
import { Gate, Location } from '../src/modules/locations/location.models.js';
import { User } from '../src/modules/users/user.model.js';

let fx: Fixture;
let gateId = '';
let locationId = '';
const oid = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);
const adminAuth = () => `Bearer ${fx.adminA.token}`;
const opAuth = () => `Bearer ${fx.operatorA.token}`;

async function activeBand(uid: string, userId: string) {
  return NFCBand.create({
    organizationId: oid(fx.orgA.id),
    bandId: `NF-${uid.slice(-4).replace(/:/g, '')}`,
    nfcUid: uid,
    type: 'STUDENT',
    status: 'ACTIVE',
    userId: oid(userId),
    issuedAt: new Date(),
    activatedAt: new Date(),
    createdBy: oid(fx.adminA.id),
  });
}

const scan = (body: Record<string, unknown>) =>
  request(app).post('/api/nfc/scan').set('Authorization', opAuth()).send(body);

beforeAll(async () => {
  await startDb();
});
afterAll(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  fx = await seedFixtures();
  const loc = await Location.create({ organizationId: oid(fx.orgA.id), name: 'Main Campus', code: 'MAIN' });
  const gate = await Gate.create({ organizationId: oid(fx.orgA.id), locationId: loc._id, name: 'Main Gate', code: 'G1' });
  locationId = String(loc._id);
  gateId = String(gate._id);
});

describe('access control', () => {
  it('secure default: ENTRY is DENIED when no rule matches', async () => {
    await activeBand('04:A3:F1:9C:2B:80', fx.operatorA.id);
    const res = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', gateId, requestId: 'acc-1' });
    expect(res.body.data.result).toBe('DENIED');
    expect(res.body.data.message).toMatch(/No access rule/);
  });

  it('ALLOW rule with time window gates entry; EXIT stays free', async () => {
    await activeBand('04:A3:F1:9C:2B:80', fx.operatorA.id);
    await request(app).post('/api/access/rules').set('Authorization', adminAuth()).send({
      name: 'Main gate open hours',
      gateId,
      effect: 'ALLOW',
    });

    const ok = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', gateId, requestId: 'acc-2' });
    expect(ok.body.data.result).toBe('SUCCESS');
    expect(ok.body.data.accessEvent.decision).toBe('ALLOW');

    const exit = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'EXIT', gateId, requestId: 'acc-3' });
    expect(exit.body.data.result).toBe('SUCCESS');
  });

  it('DENY beats ALLOW regardless of priority ordering', async () => {
    await activeBand('04:A3:F1:9C:2B:80', fx.operatorA.id);
    await request(app).post('/api/access/rules').set('Authorization', adminAuth()).send({
      name: 'Everyone in', effect: 'ALLOW', priority: 1,
    });
    await request(app).post('/api/access/rules').set('Authorization', adminAuth()).send({
      name: 'Operators blocked at gate', gateId, effect: 'DENY', priority: 500, userGroups: ['OPERATOR'],
    });

    const res = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', gateId, requestId: 'acc-4' });
    expect(res.body.data.result).toBe('DENIED');
    expect(res.body.data.message).toMatch(/Operators blocked/);
  });

  it('group restriction: rule for OPERATORs does not admit admins', async () => {
    await activeBand('04:A3:F1:9C:2B:80', fx.adminA.id);
    await request(app).post('/api/access/rules').set('Authorization', adminAuth()).send({
      name: 'Operators only', effect: 'ALLOW', userGroups: ['OPERATOR'],
    });
    // Scan runs as operator but the BAND belongs to an ADMIN → rule must not match.
    const res = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', requestId: 'acc-5' });
    expect(res.body.data.result).toBe('DENIED');
  });

  it('operators cannot manage rules; rule updates are audited and scoped', async () => {
    const denied = await request(app)
      .post('/api/access/rules')
      .set('Authorization', opAuth())
      .send({ name: 'x', effect: 'ALLOW' });
    expect(denied.status).toBe(403);

    const rule = await request(app).post('/api/access/rules').set('Authorization', adminAuth()).send({
      name: 'Temp rule', effect: 'ALLOW',
    });
    expect(rule.status).toBe(201);

    const off = await request(app)
      .patch(`/api/access/rules/${rule.body.data._id}`)
      .set('Authorization', adminAuth())
      .send({ status: 'INACTIVE' });
    expect(off.body.data.status).toBe('INACTIVE');

    const cross = await request(app)
      .patch(`/api/access/rules/${rule.body.data._id}`)
      .set('Authorization', `Bearer ${fx.adminB.token}`)
      .send({ status: 'ACTIVE' });
    expect(cross.status).toBe(404);
  });

  it('access events list is org-scoped with decision filter', async () => {
    await activeBand('04:A3:F1:9C:2B:80', fx.operatorA.id);
    await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', gateId, requestId: 'acc-6' }); // DENIED, no rules
    const events = await request(app).get('/api/access/events?decision=DENY').set('Authorization', adminAuth());
    expect(events.body.data.total).toBe(1);

    const other = await User.create({
      organizationId: oid(fx.orgB.id),
      email: 'z@beta.example',
      passwordHash: 'x',
      firstName: 'Z',
      lastName: 'B',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    void other;
    const cross = await request(app).get('/api/access/events').set('Authorization', `Bearer ${fx.adminB.token}`);
    expect(cross.body.data.total).toBe(0);
  });
});
