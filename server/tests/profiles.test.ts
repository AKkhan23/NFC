import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, clearDb, request, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { Profile } from '../src/modules/profiles/profile.model.js';

let fx: Fixture;
const adminAuth = () => `Bearer ${fx.adminA.token}`;
const opAuth = () => `Bearer ${fx.operatorA.token}`;

const base = (userId: string, extra: Record<string, unknown> = {}) => ({
  userId,
  displayName: 'Asha Fixture',
  title: 'Principal',
  phone: '+919876543210',
  email: 'asha@example.com',
  whatsapp: '+919876543210',
  website: 'https://example.com',
  links: [
    { label: 'Instagram', url: 'https://instagram.com/asha' },
    { label: 'LinkedIn', url: 'https://linkedin.com/in/asha' },
  ],
  ...extra,
});

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

describe('Tap profiles (digital business cards)', () => {
  it('creates a profile with auto slug; same user upserts instead of duplicating', async () => {
    const first = await request(app).post('/api/profiles').set('Authorization', adminAuth()).send(base(fx.operatorA.id));
    expect(first.status).toBe(201);
    expect(first.body.data.slug).toBe('asha-fixture');

    const second = await request(app)
      .post('/api/profiles')
      .set('Authorization', adminAuth())
      .send(base(fx.operatorA.id, { title: 'Vice Principal' }));
    expect(second.status).toBe(201);
    expect(second.body.data.slug).toBe('asha-fixture');
    expect(await Profile.countDocuments({})).toBe(1);
  });

  it('auto-suffixes colliding slugs across users', async () => {
    const a = await request(app).post('/api/profiles').set('Authorization', adminAuth()).send(base(fx.operatorA.id));
    const b = await request(app).post('/api/profiles').set('Authorization', adminAuth()).send(base(fx.adminA.id));
    expect(a.body.data.slug).toBe('asha-fixture');
    expect(b.body.data.slug).toBe('asha-fixture-2');
  });

  it('public page works without login, hides internals, and counts views', async () => {
    await request(app).post('/api/profiles').set('Authorization', adminAuth()).send(base(fx.operatorA.id));
    const one = await request(app).get('/api/profiles/p/asha-fixture');
    expect(one.status).toBe(200);
    expect(one.body.data.displayName).toBe('Asha Fixture');
    expect(one.body.data.organizationId).toBeUndefined();
    expect(one.body.data.userId).toBeUndefined();
    expect(one.body.data.views).toBe(1);
    const two = await request(app).get('/api/profiles/p/asha-fixture');
    expect(two.body.data.views).toBe(2);
  });

  it('unpublished profiles 404 publicly', async () => {
    const created = await request(app)
      .post('/api/profiles')
      .set('Authorization', adminAuth())
      .send(base(fx.operatorA.id, { isPublic: false }));
    expect(created.status).toBe(201);
    expect((await request(app).get('/api/profiles/p/asha-fixture')).status).toBe(404);
    expect((await request(app).get('/api/profiles/p/asha-fixture/vcard')).status).toBe(404);
  });

  it('serves a valid vCard contact file', async () => {
    await request(app).post('/api/profiles').set('Authorization', adminAuth()).send(base(fx.operatorA.id));
    const res = await request(app).get('/api/profiles/p/asha-fixture/vcard');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/vcard');
    expect(res.text).toContain('BEGIN:VCARD');
    expect(res.text).toContain('FN:Asha Fixture');
    expect(res.text).toContain('TEL;TYPE=CELL,VOICE:+919876543210');
    expect(res.text).toContain('END:VCARD');
  });

  it('validates phone, URLs, and slugs', async () => {
    const badPhone = await request(app)
      .post('/api/profiles')
      .set('Authorization', adminAuth())
      .send(base(fx.operatorA.id, { phone: '98765' }));
    expect(badPhone.status).toBe(400);
    const badUrl = await request(app)
      .post('/api/profiles')
      .set('Authorization', adminAuth())
      .send(base(fx.operatorA.id, { website: 'not-a-url' }));
    expect(badUrl.status).toBe(400);
    const badSlug = await request(app)
      .post('/api/profiles')
      .set('Authorization', adminAuth())
      .send(base(fx.operatorA.id, { slug: 'Bad Slug!!' }));
    expect(badSlug.status).toBe(400);
  });

  it('operators cannot manage profiles; management needs login', async () => {
    const forbidden = await request(app).post('/api/profiles').set('Authorization', opAuth()).send(base(fx.operatorA.id));
    expect(forbidden.status).toBe(403);
    const anon = await request(app).post('/api/profiles').send(base(fx.operatorA.id));
    expect(anon.status).toBe(401);
  });

  it('org isolation: other org cannot see or take the slug', async () => {
    await request(app).post('/api/profiles').set('Authorization', adminAuth()).send(base(fx.operatorA.id));
    const list = await request(app).get('/api/profiles').set('Authorization', `Bearer ${fx.adminB.token}`);
    expect(list.body.data.total).toBe(0);
  });

  it('self-service: any login manages only their own card', async () => {
    // No profile yet.
    expect((await request(app).get('/api/profiles/me').set('Authorization', opAuth())).status).toBe(404);
    // Create own (STUDENT-style login with zero permissions would also pass requireAuth).
    const { userId: _ignored, ...mine } = base('unused');
    const created = await request(app).post('/api/profiles/me').set('Authorization', opAuth()).send(mine);
    expect(created.status).toBe(201);
    expect(created.body.data.slug).toBe('asha-fixture');
    // Read back + update own.
    const read = await request(app).get('/api/profiles/me').set('Authorization', opAuth());
    expect(read.status).toBe(200);
    expect(read.body.data.displayName).toBe('Asha Fixture');
    // Other holders are invisible to this endpoint (still 404-free own record only).
    const other = await request(app).get('/api/profiles/me').set('Authorization', adminAuth());
    expect(other.status).toBe(404);
  });

  it('self-service requires login', async () => {
    expect((await request(app).get('/api/profiles/me')).status).toBe(401);
    const { userId: _ignored, ...mine } = base('unused');
    expect((await request(app).post('/api/profiles/me').send(mine)).status).toBe(401);
  });
});
