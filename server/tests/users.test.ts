import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { AuditLog } from '../src/modules/audit/audit.model.js';

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

describe('users CRUD', () => {
  it('creates a user and writes an audit record', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({
        email: 'neha.sharma@alpha.example',
        password: 'TestPass123!',
        firstName: 'Neha',
        lastName: 'Sharma',
        role: 'OPERATOR',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('neha.sharma@alpha.example');

    const audit = await AuditLog.findOne({ action: 'USER_CREATED' }).lean();
    expect(audit).toBeTruthy();
    expect(String(audit?.organizationId)).toBe(fx.orgA.id);
  });

  it('new user can log in', async () => {
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({
        email: 'kabir@alpha.example',
        password: 'TestPass123!',
        firstName: 'Kabir',
        lastName: 'Singh',
        role: 'VIEWER',
      });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'kabir@alpha.example', password: 'TestPass123!' });
    expect(login.status).toBe(200);
  });

  it('disables a user; disabled user cannot log in', async () => {
    const res = await request(app)
      .patch(`/api/users/${fx.operatorA.id}`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ status: 'DISABLED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DISABLED');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: fx.operatorA.email, password: fx.operatorA.password });
    expect(login.status).toBe(403);
  });

  it('cannot disable your own account', async () => {
    const res = await request(app)
      .patch(`/api/users/${fx.adminA.id}`)
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({ status: 'DISABLED' });
    expect(res.status).toBe(400);
  });

  it('supports search + pagination', async () => {
    const res = await request(app)
      .get('/api/users?search=oper&page=1&pageSize=1')
      .set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.totalPages).toBe(1);
  });
});
