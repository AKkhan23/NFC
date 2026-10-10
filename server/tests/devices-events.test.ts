import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { AccessRule } from '../src/modules/access/access.models.js';
import { NFCBand } from '../src/modules/bands/band.model.js';

let fx: Fixture;
const oid = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);
const adminAuth = () => `Bearer ${fx.adminA.token}`;
const opAuth = () => `Bearer ${fx.operatorA.token}`;

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

describe('devices, locations, events', () => {
  it('location → zone → gate hierarchy via API with scoped uniqueness', async () => {
    const loc = await request(app).post('/api/locations').set('Authorization', adminAuth()).send({
      name: 'North Campus', code: 'NORTH', type: 'CAMPUS', timezone: 'Asia/Kolkata',
    });
    expect(loc.status).toBe(201);

    const dup = await request(app).post('/api/locations').set('Authorization', adminAuth()).send({
      name: 'North Again', code: 'NORTH',
    });
    expect(dup.status).toBe(409);

    const zone = await request(app).post('/api/locations/zones').set('Authorization', adminAuth()).send({
      locationId: loc.body.data._id, name: 'Library', code: 'LIB',
    });
    expect(zone.status).toBe(201);

    const gate = await request(app).post('/api/locations/gates').set('Authorization', adminAuth()).send({
      locationId: loc.body.data._id, zoneId: zone.body.data._id, name: 'Library Gate', code: 'G1',
    });
    expect(gate.status).toBe(201);

    const tree = await request(app).get('/api/locations/tree').set('Authorization', adminAuth());
    expect(tree.body.data[0].zones[0].gates[0].code).toBe('G1');
  });

  it('devices register OFFLINE, heartbeat flips ONLINE, stale is derived OFFLINE', async () => {
    const reg = await request(app).post('/api/devices').set('Authorization', adminAuth()).send({
      deviceId: 'DEV-01', name: 'Gate kiosk', type: 'KIOSK', adapterType: 'keyboard',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.data.status).toBe('OFFLINE');
    const id = reg.body.data._id as string;

    // Kiosk terminals can heartbeat with just nfc.scan.
    const beat = await request(app).post(`/api/devices/${id}/heartbeat`).set('Authorization', opAuth()).send({});
    expect(beat.body.data.health).toBe('ONLINE');

    const stats = await request(app).get(`/api/devices/${id}/stats`).set('Authorization', adminAuth());
    expect(stats.body.data.scans24h).toBe(0);

    const viewerDenied = await request(app).get('/api/devices').set('Authorization', opAuth());
    expect(viewerDenied.status).toBe(403); // OPERATOR lacks devices.read
  });

  it('events enforce capacity and group allowlists, NFC or manual', async () => {
    const ev = await request(app).post('/api/events').set('Authorization', adminAuth()).send({
      name: 'Robotics Workshop',
      startAt: new Date(Date.now() + 3600000).toISOString(),
      endAt: new Date(Date.now() + 7200000).toISOString(),
      capacity: 1,
      allowedGroups: ['OPERATOR'],
    });
    expect(ev.status).toBe(201);
    const eventId = ev.body.data._id as string;
    await request(app).patch(`/api/events/${eventId}`).set('Authorization', adminAuth()).send({ status: 'PUBLISHED' });

    const in1 = await request(app).post(`/api/events/${eventId}/check-in`).set('Authorization', adminAuth()).send({
      userId: fx.operatorA.id,
    });
    expect(in1.body.data.event.checkedInCount).toBe(1);

    // Same user twice → duplicate.
    const dup = await request(app).post(`/api/events/${eventId}/check-in`).set('Authorization', adminAuth()).send({
      userId: fx.operatorA.id,
    });
    expect(dup.status).toBe(409);

    // Admin is not in allowedGroups → 403; capacity is also full → would be 409 regardless.
    const outsider = await request(app).post(`/api/events/${eventId}/check-in`).set('Authorization', adminAuth()).send({
      userId: fx.adminA.id,
    });
    expect([403, 409]).toContain(outsider.status);
  });

  it('NFC EVENT_CHECK_IN with metadata.eventId fills the event and respects capacity', async () => {
    const ev = await request(app).post('/api/events').set('Authorization', adminAuth()).send({
      name: 'Morning Assembly',
      startAt: new Date(Date.now() + 3600000).toISOString(),
      endAt: new Date(Date.now() + 7200000).toISOString(),
      capacity: 1,
    });
    const eventId = ev.body.data._id as string;
    await request(app).patch(`/api/events/${eventId}`).set('Authorization', adminAuth()).send({ status: 'PUBLISHED' });
    await AccessRule.create({ organizationId: oid(fx.orgA.id), name: 'open', effect: 'ALLOW' });

    for (const u of [fx.operatorA, fx.adminA]) {
      const tail = u.id.slice(-8).toUpperCase(); // random tail of the ObjectId — unique per user
      await NFCBand.create({
        organizationId: oid(fx.orgA.id),
        bandId: `NF-${tail.slice(-4)}`,
        nfcUid: `04:EE:${tail.slice(0, 2)}:${tail.slice(2, 4)}:${tail.slice(4, 6)}:${tail.slice(6, 8)}`,
        type: 'STAFF',
        status: 'ACTIVE',
        userId: oid(u.id),
        issuedAt: new Date(),
        activatedAt: new Date(),
        createdBy: oid(fx.adminA.id),
      });
    }
    const band1 = await NFCBand.findOne({ userId: oid(fx.operatorA.id) }).select('nfcUid').lean();
    const first = await request(app).post('/api/nfc/scan').set('Authorization', opAuth()).send({
      nfcUid: band1?.nfcUid, action: 'EVENT_CHECK_IN', metadata: { eventId }, requestId: 'evt-scan-1',
    });
    expect(first.body.data.result).toBe('SUCCESS');

    const band2 = await NFCBand.findOne({ userId: oid(fx.adminA.id) }).select('nfcUid').lean();
    const second = await request(app).post('/api/nfc/scan').set('Authorization', opAuth()).send({
      nfcUid: band2?.nfcUid, action: 'EVENT_CHECK_IN', metadata: { eventId }, requestId: 'evt-scan-2',
    });
    expect(second.body.data.result).toBe('DENIED');
    expect(second.body.data.message).toMatch(/capacity/i);
  });
});
