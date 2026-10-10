import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { User } from '../src/modules/users/user.model.js';

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

describe('auth', () => {
  it('logs in with valid credentials and returns tokens + user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: fx.adminA.email, password: fx.adminA.password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(res.body.data.refreshToken).toBeTypeOf('string');
    expect(res.body.data.user.role).toBe('ADMIN');
    expect(res.body.requestId).toMatch(/^req_/);
  });

  it('rejects wrong password with 401 (no user enumeration detail)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: fx.adminA.email, password: 'WrongPass123!' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects disabled accounts with 403', async () => {
    await User.updateOne({ email: fx.adminA.email }, { $set: { status: 'DISABLED' } });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: fx.adminA.email, password: fx.adminA.password });
    expect(res.status).toBe(403);
  });

  it('rejects invalid body with validation envelope', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nope', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('refresh flow issues a new access token; logout revokes the session', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: fx.adminA.email, password: fx.adminA.password });
    const refreshToken = login.body.data.refreshToken as string;

    const r1 = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.data.accessToken).toBeTypeOf('string');

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${r1.body.data.accessToken}`);
    expect(me.status).toBe(200);

    await request(app).post('/api/auth/logout').send({ refreshToken });
    const r2 = await request(app).post('/api/auth/refresh').send({ refreshToken });
    // Session was revoked at logout; refresh must fail. (Implementation may return 401.)
    expect([401, 404]).toContain(r2.status);
  });

  it('rejects /me without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
