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

describe('organization isolation', () => {
  it('Org A admin sees only Org A users', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(res.status).toBe(200);
    const emails = (res.body.data.items as { email: string }[]).map((u) => u.email);
    expect(emails).toContain('admin@alpha.example');
    expect(emails).not.toContain('admin@beta.example');
  });

  it('Org A admin cannot read an Org B user by id (404, not 403 — no existence leak)', async () => {
    const beta = await request(app).get('/api/users').set('Authorization', `Bearer ${fx.adminB.token}`);
    const betaId = beta.body.data.items[0]._id as string;
    const res = await request(app)
      .get(`/api/users/${betaId}`)
      .set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(res.status).toBe(404);
  });

  it('explicit organizationId in body is ignored for non-super-admins (pinned to token org)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({
        email: 'cross@alpha.example',
        password: 'TestPass123!',
        firstName: 'Cross',
        lastName: 'Org',
        role: 'VIEWER',
        organizationId: fx.orgB.id, // must be ignored
      });
    expect(res.status).toBe(201);
    expect(res.body.data.organizationId).toBe(fx.orgA.id);
  });

  it('duplicate email in the same org is rejected, but allowed in another org', async () => {
    const dup = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${fx.adminA.token}`)
      .send({
        email: 'admin@alpha.example',
        password: 'TestPass123!',
        firstName: 'Dup',
        lastName: 'User',
        role: 'VIEWER',
      });
    expect(dup.status).toBe(409);

    const other = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${fx.adminB.token}`)
      .send({
        email: 'admin@alpha.example', // same address, different org — allowed
        password: 'TestPass123!',
        firstName: 'Same',
        lastName: 'Email',
        role: 'VIEWER',
      });
    expect(other.status).toBe(201);
  });

  it('passwordHash is never exposed via the API', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${fx.adminA.token}`);
    for (const u of res.body.data.items as Record<string, unknown>[]) {
      expect(u).not.toHaveProperty('passwordHash');
    }
    const one = await request(app)
      .get(`/api/users/${fx.adminA.id}`)
      .set('Authorization', `Bearer ${fx.adminA.token}`);
    expect(one.body.data).not.toHaveProperty('passwordHash');
  });
});
