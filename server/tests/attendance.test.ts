import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { AuditLog } from '../src/modules/audit/audit.model.js';

let fx: Fixture;
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

describe('attendance', () => {
  it('late check-in is flagged with minutes (org lateAfter 09:30 UTC)', async () => {
    // 10:15 UTC on a fixed date → 45 min late.
    const res = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', opAuth())
      .send({ userId: fx.operatorA.id, at: '2026-09-03T10:15:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('LATE');
    expect(res.body.data.minutesLate).toBe(45);
    expect(res.body.data.date).toBe('2026-09-03');
  });

  it('early checkout marks EARLY_EXIT; late arrival + early exit marks HALF_DAY', async () => {
    await request(app).post('/api/attendance/check-in').set('Authorization', opAuth()).send({
      userId: fx.operatorA.id, at: '2026-09-03T08:00:00.000Z',
    });
    // Day end default 17:00 → 15:00 checkout is >60 min early.
    const out = await request(app).post('/api/attendance/check-out').set('Authorization', opAuth()).send({
      userId: fx.operatorA.id, at: '2026-09-03T15:00:00.000Z',
    });
    expect(out.body.data.status).toBe('EARLY_EXIT');

    await request(app).post('/api/attendance/check-in').set('Authorization', opAuth()).send({
      userId: fx.adminA.id, at: '2026-09-04T10:00:00.000Z',
    });
    const out2 = await request(app).post('/api/attendance/check-out').set('Authorization', opAuth()).send({
      userId: fx.adminA.id, at: '2026-09-04T15:00:00.000Z',
    });
    expect(out2.body.data.status).toBe('HALF_DAY');
  });

  it('manual record + correction keep an audit trail', async () => {
    const m = await request(app).post('/api/attendance/manual').set('Authorization', opAuth()).send({
      userId: fx.operatorA.id,
      date: '2026-09-05',
      checkInAt: '2026-09-05T08:00:00.000Z',
      status: 'PRESENT',
      remarks: 'Front-desk entry',
    });
    expect(m.status).toBe(200);

    const c = await request(app)
      .patch(`/api/attendance/${m.body.data._id}/correct`)
      .set('Authorization', opAuth())
      .send({ status: 'ON_LEAVE', remarks: 'Approved leave, correcting' });
    expect(c.body.data.status).toBe('ON_LEAVE');
    expect(c.body.data.correctedBy).toBeTruthy();

    const audit = await AuditLog.findOne({ action: 'ATTENDANCE_CORRECTED' }).lean();
    expect(audit?.previousState).toMatchObject({ status: 'PRESENT' });
  });

  it('daily and monthly queries are org-scoped', async () => {
    await request(app).post('/api/attendance/check-in').set('Authorization', opAuth()).send({
      userId: fx.operatorA.id, at: '2026-09-03T08:00:00.000Z',
    });
    const day = await request(app).get('/api/attendance?date=2026-09-03').set('Authorization', opAuth());
    expect(day.body.data.total).toBe(1);

    const month = await request(app)
      .get('/api/attendance?from=2026-09-01&to=2026-09-30')
      .set('Authorization', opAuth());
    expect(month.body.data.total).toBe(1);

    const cross = await request(app).get('/api/attendance?date=2026-09-03').set('Authorization', `Bearer ${fx.adminB.token}`);
    expect(cross.body.data.total).toBe(0);
  });

  it('viewers cannot record attendance (backend-enforced)', async () => {
    const created = await request(app)
      .post('/api/users')
      .set('Authorization', adminAuth())
      .send({ email: 'viewer@alpha.example', password: 'TestPass123!', firstName: 'V', lastName: 'W', role: 'VIEWER' });
    expect(created.status).toBe(201);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'viewer@alpha.example', password: 'TestPass123!' });
    const res = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ userId: fx.adminA.id });
    expect(res.status).toBe(403);
  });
});
