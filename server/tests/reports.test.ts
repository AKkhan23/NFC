import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { Notification } from '../src/modules/notifications/notification.model.js';

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

describe('notifications, audit, settings, reports', () => {
  it('blocking a band notifies the org; holder scans notify the holder', async () => {
    const reg = await request(app).post('/api/bands').set('Authorization', adminAuth()).send({
      nfcUid: '04:AA:BB:CC:DD:EE', type: 'STUDENT',
    });
    const id = reg.body.data._id as string;
    await request(app).post(`/api/bands/${id}/assign`).set('Authorization', adminAuth()).send({ userId: fx.operatorA.id });
    await request(app).post(`/api/bands/${id}/activate`).set('Authorization', adminAuth());
    await request(app).post(`/api/bands/${id}/block`).set('Authorization', adminAuth()).send({ reason: 'Stolen' });

    const orgWide = await Notification.find({ type: 'BAND_BLOCKED', userId: null }).lean();
    expect(orgWide.length).toBe(1);

    // Holder scans the blocked band → personal notification.
    await request(app).post('/api/nfc/scan').set('Authorization', opAuth()).send({
      nfcUid: '04:AA:BB:CC:DD:EE', action: 'ENTRY', requestId: 'notif-scan-1',
    });
    const personal = await Notification.find({ type: 'BAND_BLOCKED', userId: { $ne: null } }).lean();
    expect(personal.length).toBe(1);

    // Visibility: operator sees org-wide + own; other org sees nothing.
    const mine = await request(app).get('/api/notifications').set('Authorization', opAuth());
    expect(mine.body.data.total).toBe(2);
    expect(mine.body.data.unread).toBe(2);
    const cross = await request(app).get('/api/notifications').set('Authorization', `Bearer ${fx.adminB.token}`);
    expect(cross.body.data.total).toBe(0);

    // Read flows.
    await request(app).post(`/api/notifications/${personal[0]._id}/read`).set('Authorization', opAuth());
    const after = await request(app).get('/api/notifications?unreadOnly=true').set('Authorization', opAuth());
    expect(after.body.data.unread).toBe(1);
    await request(app).post('/api/notifications/read-all').set('Authorization', opAuth());
    const done = await request(app).get('/api/notifications?unreadOnly=true').set('Authorization', opAuth());
    expect(done.body.data.unread).toBe(0);
  });

  it('low-balance nudges fire once per day after debits', async () => {
    await request(app).post(`/api/wallets/${fx.operatorA.id}/credit`).set('Authorization', adminAuth()).send({
      amountMinor: 6000, idempotencyKey: 'notif-fund-01',
    });
    await request(app).post(`/api/wallets/${fx.operatorA.id}/debit`).set('Authorization', adminAuth()).send({
      amountMinor: 2000, idempotencyKey: 'notif-deb-01',
    });
    expect(await Notification.countDocuments({ type: 'LOW_BALANCE' })).toBe(1);
    await request(app).post(`/api/wallets/${fx.operatorA.id}/debit`).set('Authorization', adminAuth()).send({
      amountMinor: 100, idempotencyKey: 'notif-deb-02',
    });
    expect(await Notification.countDocuments({ type: 'LOW_BALANCE' })).toBe(1); // deduped
  });

  it('audit log is readable with filters and has no write API', async () => {
    await request(app).post('/api/users').set('Authorization', adminAuth()).send({
      email: 'audit.t@alpha.example', password: 'TestPass123!', firstName: 'Audit', lastName: 'T', role: 'VIEWER',
    });
    const list = await request(app).get('/api/audit-logs?action=USER_CREATED').set('Authorization', adminAuth());
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items[0].actorId.email).toBe('admin@alpha.example');

    // No mutation routes exist.
    expect(await request(app).delete('/api/audit-logs/x').set('Authorization', adminAuth()).then((r) => r.status)).toBe(404);

    const opDenied = await request(app).get('/api/audit-logs').set('Authorization', opAuth());
    expect(opDenied.status).toBe(403);
  });

  it('settings read/update round-trips with audit', async () => {
    const get = await request(app).get('/api/settings').set('Authorization', adminAuth());
    expect(get.body.data.settings.attendanceLateAfter).toBe('09:30');

    const put = await request(app).put('/api/settings').set('Authorization', adminAuth()).send({
      attendanceLateAfter: '10:00', dupScanWindowMs: 5000,
    });
    expect(put.body.data.settings.attendanceLateAfter).toBe('10:00');

    const bad = await request(app).put('/api/settings').set('Authorization', adminAuth()).send({ attendanceLateAfter: 'nope' });
    expect(bad.status).toBe(400);

    const opDenied = await request(app).put('/api/settings').set('Authorization', opAuth()).send({ attendanceLateAfter: '10:00' });
    expect(opDenied.status).toBe(403);
  });

  it('reports summary aggregates and CSV export downloads', async () => {
    const reg = await request(app).post('/api/bands').set('Authorization', adminAuth()).send({
      nfcUid: '04:11:22:33:44:55', type: 'STUDENT',
    });
    expect(reg.status).toBe(201);

    const summary = await request(app).get('/api/reports/summary').set('Authorization', adminAuth());
    expect(summary.status).toBe(200);
    expect(summary.body.data.bandsByStatus).toEqual([{ _id: 'AVAILABLE', count: 1 }]);
    expect(summary.body.data.activeUsers).toBe(2);

    // CSV export is a paid feature — subscribe first (fixtures start on TRIAL).
    await request(app).post('/api/billing/subscribe').set('Authorization', adminAuth()).send({ plan: 'BASIC', provider: 'MANUAL' });
    const csv = await request(app).get('/api/reports/export?domain=bands').set('Authorization', adminAuth());
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toMatch(/NF-/);

    // Back on TRIAL, export is refused with an upgrade hint.
    const { Organization } = await import('../src/modules/organizations/organization.model.js');
    await Organization.updateOne({ _id: fx.orgA.id }, { $set: { 'subscription.plan': 'TRIAL' } });
    const trialDenied = await request(app).get('/api/reports/export?domain=bands').set('Authorization', adminAuth());
    expect(trialDenied.status).toBe(402);

    const opDenied = await request(app).get('/api/reports/summary').set('Authorization', opAuth());
    expect(opDenied.status).toBe(403); // OPERATOR lacks reports.read
  });
});
