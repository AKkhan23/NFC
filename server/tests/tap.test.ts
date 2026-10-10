import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { NFCBand } from '../src/modules/bands/band.model.js';
import { Attendance } from '../src/modules/attendance/attendance.model.js';

let fx: Fixture;
const oid = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);

const TOKEN = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

async function tapBand(uid: string, patch: Record<string, unknown> = {}) {
  return NFCBand.create({
    organizationId: oid(fx.orgA.id),
    bandId: `NF-${uid.slice(-4).replace(/:/g, '')}`,
    nfcUid: uid,
    type: 'STUDENT',
    status: 'ACTIVE',
    userId: oid(fx.operatorA.id),
    issuedAt: new Date(),
    activatedAt: new Date(),
    createdBy: oid(fx.adminA.id),
    tapToken: TOKEN,
    ...patch,
  });
}

const tap = (body: Record<string, unknown>) => request(app).post('/api/nfc/tap').send(body);
const adminAuth = () => `Bearer ${fx.adminA.token}`;

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

describe('Phone-tap check-in link', () => {
  it('valid token records CHECK_IN + attendance without login', async () => {
    await tapBand('04:A3:F1:9C:2B:80');
    const res = await tap({ token: TOKEN });
    expect(res.status).toBe(201);
    expect(res.body.data.result).toBe('SUCCESS');
    expect(res.body.data.message).toBe('Checked in');
    expect(res.body.data.bandId).toBeTruthy();
    expect(res.body.data.name).toContain(' ');
    expect(res.body.data.nfcUid).toBeUndefined();

    const rows = await Attendance.find({ userId: oid(fx.operatorA.id) }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].checkInMethod).toBe('NFC');
    expect(['PRESENT', 'LATE']).toContain(rows[0].status);
  });

  it('rejects malformed and unknown tokens', async () => {
    const bad = await tap({ token: 'nope' });
    expect(bad.status).toBe(400);
    const unknown = await tap({ token: OTHER });
    expect(unknown.status).toBe(404);
  });

  it('refuses non-active bands', async () => {
    await tapBand('04:A3:F1:9C:2B:80', { status: 'BLOCKED', blockedReason: 'Fraud review' });
    const res = await tap({ token: TOKEN });
    expect(res.status).toBe(409);
    expect(await Attendance.countDocuments({ userId: oid(fx.operatorA.id) })).toBe(0);
  });

  it('double tap inside the window replays without a second attendance row', async () => {
    await tapBand('04:A3:F1:9C:2B:80');
    const first = await tap({ token: TOKEN });
    expect(first.status).toBe(201);
    const second = await tap({ token: TOKEN });
    expect(second.status).toBe(200);
    expect(await Attendance.countDocuments({ userId: oid(fx.operatorA.id) })).toBe(1);
  });

  it('admin can rotate the tap link; old token dies', async () => {
    const band = await tapBand('04:A3:F1:9C:2B:80');
    const res = await request(app)
      .post(`/api/bands/${String(band._id)}/tap-link`)
      .set('Authorization', adminAuth())
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.data.tapToken).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.data.tapToken).not.toBe(TOKEN);

    expect((await tap({ token: TOKEN })).status).toBe(404);
    const fresh = await tap({ token: res.body.data.tapToken });
    expect(fresh.status).toBe(201);
    expect(fresh.body.data.result).toBe('SUCCESS');
  });

  it('tap link generation requires auth', async () => {
    const band = await tapBand('04:A3:F1:9C:2B:80');
    const res = await request(app).post(`/api/bands/${String(band._id)}/tap-link`).send({});
    expect(res.status).toBe(401);
  });
});
