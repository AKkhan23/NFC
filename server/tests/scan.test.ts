import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { signAccessToken } from '../src/modules/auth/auth.tokens.js';
import { ROLE_PERMISSIONS } from '../src/modules/permissions/permissions.constants.js';
import { NFCBand } from '../src/modules/bands/band.model.js';
import { NFCScan } from '../src/modules/nfc/nfcScan.model.js';
import { Attendance } from '../src/modules/attendance/attendance.model.js';
import { AccessEvent, AccessRule } from '../src/modules/access/access.models.js';
import { NFCDevice } from '../src/modules/devices/device.model.js';
import { Gate, Location } from '../src/modules/locations/location.models.js';
import { User } from '../src/modules/users/user.model.js';

let fx: Fixture;
let deviceId = '';
let locationId = '';
let gateId = '';
const oid = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);

async function activeBand(uid: string, userId: string, patch: Record<string, unknown> = {}) {
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
    ...patch,
  });
}

const opAuth = () => `Bearer ${fx.operatorA.token}`;
const scan = (body: Record<string, unknown>, token?: string) =>
  request(app).post('/api/nfc/scan').set('Authorization', token ?? opAuth()).send(body);

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
  const dev = await NFCDevice.create({
    organizationId: oid(fx.orgA.id),
    deviceId: 'DEV-01',
    name: 'Gate kiosk',
    type: 'KIOSK',
    locationId: loc._id,
    gateId: gate._id,
    status: 'ONLINE',
    adapterType: 'keyboard',
  });
  locationId = String(loc._id);
  gateId = String(gate._id);
  deviceId = String(dev._id);
  // Secure default-deny: every ENTRY test needs an explicit ALLOW rule.
  await AccessRule.create({
    organizationId: oid(fx.orgA.id),
    name: 'Open hours',
    effect: 'ALLOW',
    days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    startTime: '00:00',
    endTime: '23:59',
    bandStatuses: ['ACTIVE'],
  });
});

describe('NFC scan pipeline', () => {
  it('ENTRY on an ACTIVE band succeeds and records an ALLOW access event', async () => {
    const band = await activeBand('04:A3:F1:9C:2B:80', fx.operatorA.id);
    const res = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', deviceId, locationId, gateId });
    expect(res.status).toBe(201);
    expect(res.body.data.result).toBe('SUCCESS');
    expect(res.body.data.message).toBe('Access granted');

    const ev = await AccessEvent.findOne({ scanId: res.body.data.scan._id }).lean();
    expect(ev?.decision).toBe('ALLOW');
    expect(String((ev?.bandId as unknown as mongoose.Types.ObjectId))).toBe(String(band._id));
  });

  it('unknown UID records UNKNOWN without leaking registry data', async () => {
    const res = await scan({ nfcUid: '04:00:00:00:00:00', action: 'ENTRY', deviceId });
    expect(res.body.data.result).toBe('UNKNOWN');
    expect(res.body.data.scan.bandId).toBeFalsy();
  });

  it('blocked / lost / expired bands are refused with specific reasons', async () => {
    await activeBand('04:A3:F1:9C:2B:80', fx.operatorA.id, { status: 'BLOCKED', blockedReason: 'Fraud review' });
    const b = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', requestId: 'r-block' });
    expect(b.body.data.result).toBe('BLOCKED');
    expect(b.body.data.message).toContain('Fraud review');

    // Age the previous scan out of the duplicate window so the next scan re-evaluates.
    async function ageLastScan(): Promise<void> {
      const last = await NFCScan.findOne({ nfcUid: '04:A3:F1:9C:2B:80' }).sort({ timestamp: -1 });
      await NFCScan.updateOne({ _id: last?._id }, { $set: { timestamp: new Date(Date.now() - 60000) } });
    }
    await ageLastScan();
    await NFCBand.updateOne({ nfcUid: '04:A3:F1:9C:2B:80' }, { $set: { status: 'LOST' } });
    const l = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', requestId: 'r-lost' });
    expect(l.body.data.result).toBe('LOST');

    await ageLastScan();

    await NFCBand.updateOne(
      { nfcUid: '04:A3:F1:9C:2B:80' },
      { $set: { status: 'ACTIVE', expiresAt: new Date(Date.now() - 1000) } },
    );
    const e = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', requestId: 'r-exp' });
    expect(e.body.data.result).toBe('EXPIRED');
    expect((await NFCBand.findOne({ nfcUid: '04:A3:F1:9C:2B:80' }).select('status').lean())?.status).toBe('EXPIRED');
  });

  it('duplicate scans inside the window are collapsed; outside it they record again', async () => {
    await activeBand('04:A3:F1:9C:2B:80', fx.operatorA.id);
    const body = { nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', deviceId };
    const first = await scan({ ...body, requestId: 'dup-1' });
    expect(first.status).toBe(201);
    const second = await scan({ ...body, requestId: 'dup-2' });
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);
    expect(await NFCScan.countDocuments()).toBe(1);

    await NFCScan.updateOne({ _id: first.body.data.scan._id }, { $set: { timestamp: new Date(Date.now() - 60000) } });
    const third = await scan({ ...body, requestId: 'dup-3' });
    expect(third.status).toBe(201);
    expect(await NFCScan.countDocuments()).toBe(2);
  });

  it('same requestId replays the original scan (financial-grade idempotency)', async () => {
    await activeBand('04:A3:F1:9C:2B:80', fx.operatorA.id);
    const body = { nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', deviceId, requestId: 'idem-9' };
    const first = await scan(body);
    const replay = await scan(body);
    expect(replay.body.data.replay).toBe(true);
    expect(replay.body.data.scan._id).toBe(first.body.data.scan._id);
    expect(await NFCScan.countDocuments()).toBe(1);
  });

  it('CHECK_IN creates attendance; CHECK_OUT closes it', async () => {
    await activeBand('04:A3:F1:9C:2B:80', fx.operatorA.id);
    const inRes = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'CHECK_IN', locationId, requestId: 'att-1' });
    expect(inRes.body.data.result).toBe('SUCCESS');
    expect(inRes.body.data.attendance.checkInAt).toBeTruthy();

    const outRes = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'CHECK_OUT', locationId, requestId: 'att-2' });
    expect(outRes.body.data.attendance.checkOutAt).toBeTruthy();
    expect(await Attendance.countDocuments()).toBe(1);
  });

  it('disabled users are DENIED; malformed UIDs are 400; viewers cannot scan', async () => {
    await activeBand('04:A3:F1:9C:2B:80', fx.operatorA.id);
    await User.updateOne({ _id: oid(fx.operatorA.id) }, { $set: { status: 'DISABLED' } });
    const d = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY', requestId: 'den-1' });
    expect(d.body.data.result).toBe('DENIED');

    const bad = await scan({ nfcUid: 'not-a-uid!!', action: 'ENTRY' });
    expect(bad.status).toBe(400);

    const viewer = await User.create({
      organizationId: oid(fx.orgA.id),
      email: 'viewer@alpha.example',
      passwordHash: 'x',
      firstName: 'V',
      lastName: 'W',
      role: 'VIEWER',
      permissions: [],
      status: 'ACTIVE',
    });
    const vToken = signAccessToken({
      sub: String(viewer._id),
      org: fx.orgA.id,
      role: 'VIEWER',
      perms: [...ROLE_PERMISSIONS.VIEWER],
    });
    const forbidden = await scan({ nfcUid: '04:A3:F1:9C:2B:80', action: 'ENTRY' }, `Bearer ${vToken}`);
    expect(forbidden.status).toBe(403);
  });
});
