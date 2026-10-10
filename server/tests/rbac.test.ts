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

describe('RBAC (backend-enforced)', () => {
  it('OPERATOR (no users.read) cannot list users', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${fx.operatorA.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('ADMIN (users.read) can list users', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
  });

  it('OPERATOR cannot create users even with a forged role in the body', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${fx.operatorA.token}`)
      .send({
        email: 'evil@alpha.example',
        password: 'TestPass123!',
        firstName: 'Evil',
        lastName: 'Actor',
        role: 'ADMIN', // role comes from token, not body — and perm check runs first
        organizationId: fx.orgB.id, // org comes from token, not body
      });
    expect(res.status).toBe(403);
  });

  it('non-super-admin cannot escalate to SUPER_ADMIN', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({
        email: 'root@alpha.example',
        password: 'TestPass123!',
        firstName: 'Root',
        lastName: 'Attempt',
        role: 'SUPER_ADMIN',
      });
    expect(res.status).toBe(403);
  });

  it('unauthenticated requests are rejected before authorization', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});
