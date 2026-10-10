import mongoose from 'mongoose';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { app, request, startDb, stopDb } from './helpers.js';

/**
 * Full product journey (spec §48 E2E):
 * login → create user → register band → assign → activate → configure access →
 * scan → attendance → activity visible → block → denied.
 */
describe('e2e product journey', () => {
  beforeAll(async () => {
    await startDb();
  });
  afterAll(async () => {
    await stopDb();
  });

  it('runs the complete workflow', async () => {
    const { Organization } = await import('../src/modules/organizations/organization.model.js');
    const { User } = await import('../src/modules/users/user.model.js');
    const { hashPassword } = await import('../src/modules/auth/auth.tokens.js');

    const org = await Organization.create({ name: 'E2E Academy', slug: 'e2e-academy' });
    const orgId = String(org._id);
    await User.create({
      organizationId: oid(orgId),
      email: 'root@e2e.example',
      passwordHash: await hashPassword('RootPass123!'),
      firstName: 'Root',
      lastName: 'Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    // Login.
    const login = await request(app).post('/api/auth/login').send({ email: 'root@e2e.example', password: 'RootPass123!' });
    expect(login.status).toBe(200);
    const token = login.body.data.accessToken as string;
    const auth = () => `Bearer ${token}`;

    // Create user.
    const user = await request(app).post('/api/users').set('Authorization', auth()).send({
      email: 'student@e2e.example', password: 'TestPass123!', firstName: 'Ishaan', lastName: 'Khan', role: 'VIEWER',
    });
    expect(user.status).toBe(201);
    const userId = user.body.data._id as string;

    // Register → assign → activate band.
    const reg = await request(app).post('/api/bands').set('Authorization', auth()).send({
      bandId: 'NF-E2E1', nfcUid: '04:E2:E2:E2:E2:01', type: 'STUDENT',
    });
    expect(reg.status).toBe(201);
    const bandId = reg.body.data._id as string;
    expect(await request(app).post(`/api/bands/${bandId}/assign`).set('Authorization', auth()).send({ userId }).then((r) => r.status)).toBe(200);
    expect(await request(app).post(`/api/bands/${bandId}/activate`).set('Authorization', auth()).then((r) => r.status)).toBe(200);

    // Configure access.
    const rule = await request(app).post('/api/access/rules').set('Authorization', auth()).send({ name: 'E2E open', effect: 'ALLOW' });
    expect(rule.status).toBe(201);

    // Scan → attendance recorded.
    const scan = await request(app).post('/api/nfc/scan').set('Authorization', auth()).send({
      nfcUid: '04:E2:E2:E2:E2:01', action: 'CHECK_IN', requestId: 'e2e-scan-1',
    });
    expect(scan.body.data.result).toBe('SUCCESS');
    expect(scan.body.data.attendance).toBeTruthy();

    // Activity visible.
    const scans = await request(app).get('/api/nfc/scans').set('Authorization', auth());
    expect(scans.body.data.total).toBe(1);
    const att = await request(app).get(`/api/attendance?userId=${userId}`).set('Authorization', auth());
    expect(att.body.data.total).toBe(1);

    // Finance: top-up + NFC payment.
    const credit = await request(app).post(`/api/wallets/${userId}/credit`).set('Authorization', auth()).send({
      amountMinor: 1000, idempotencyKey: 'e2e-fund-01',
    });
    expect(credit.status).toBe(201);
    const pay = await request(app).post('/api/nfc/scan').set('Authorization', auth()).send({
      nfcUid: '04:E2:E2:E2:E2:01', action: 'PAYMENT', amountMinor: 250, requestId: 'e2e-pay-1',
    });
    expect(pay.body.data.result).toBe('SUCCESS');

    // Block → denied everywhere.
    expect(await request(app).post(`/api/bands/${bandId}/block`).set('Authorization', auth()).send({ reason: 'E2E test' }).then((r) => r.status)).toBe(200);
    const denied = await request(app).post('/api/nfc/scan').set('Authorization', auth()).send({
      nfcUid: '04:E2:E2:E2:E2:01', action: 'ENTRY', requestId: 'e2e-scan-2',
    });
    expect(denied.body.data.result).toBe('BLOCKED');

    // Audit + reports reflect the journey.
    const audit = await request(app).get('/api/audit-logs').set('Authorization', auth());
    expect(audit.body.data.total).toBeGreaterThan(10);
    const summary = await request(app).get('/api/reports/summary').set('Authorization', auth());
    expect(summary.body.data.bandsByStatus).toEqual(expect.arrayContaining([{ _id: 'BLOCKED', count: 1 }]));
  });
});

function oid(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}
