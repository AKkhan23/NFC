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

const UID = '04:A3:F1:9C:2B:80';
const auth = () => `Bearer ${fx.adminA.token}`;

async function registerBand(over: Record<string, unknown> = {}) {
  return request(app).post('/api/bands').set('Authorization', auth()).send({
    nfcUid: UID,
    type: 'STUDENT',
    ...over,
  });
}

describe('band lifecycle', () => {
  it('register → assign → activate, each step audited', async () => {
    const reg = await registerBand({ bandId: 'NF-4821' });
    expect(reg.status).toBe(201);
    expect(reg.body.data.status).toBe('AVAILABLE');
    const id = reg.body.data._id as string;

    const assign = await request(app)
      .post(`/api/bands/${id}/assign`)
      .set('Authorization', auth())
      .send({ userId: fx.operatorA.id });
    expect(assign.status).toBe(200);
    expect(assign.body.data.status).toBe('ASSIGNED');

    const activate = await request(app).post(`/api/bands/${id}/activate`).set('Authorization', auth());
    expect(activate.status).toBe(200);
    expect(activate.body.data.status).toBe('ACTIVE');

    const actions = (await AuditLog.find({ entityId: id }).select('action').lean()).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['BAND_REGISTERED', 'BAND_ASSIGNED', 'BAND_ACTIVATED']));
  });

  it('rejects duplicate NFC UID globally', async () => {
    expect((await registerBand()).status).toBe(201);
    const dup = await registerBand({ bandId: 'NF-9999' });
    expect(dup.status).toBe(409);
  });

  it('rejects invalid transitions (activate an AVAILABLE band)', async () => {
    const reg = await registerBand();
    const res = await request(app).post(`/api/bands/${reg.body.data._id}/activate`).set('Authorization', auth());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_STATE');
  });

  it('block → unblock; unblock from wrong state fails', async () => {
    const reg = await registerBand();
    const id = reg.body.data._id as string;
    await request(app).post(`/api/bands/${id}/assign`).set('Authorization', auth()).send({ userId: fx.operatorA.id });
    await request(app).post(`/api/bands/${id}/activate`).set('Authorization', auth());

    const blocked = await request(app)
      .post(`/api/bands/${id}/block`)
      .set('Authorization', auth())
      .send({ reason: 'Stolen, under review' });
    expect(blocked.body.data.status).toBe('BLOCKED');

    const unblocked = await request(app).post(`/api/bands/${id}/unblock`).set('Authorization', auth());
    expect(unblocked.body.data.status).toBe('ACTIVE');

    const again = await request(app).post(`/api/bands/${id}/unblock`).set('Authorization', auth());
    expect(again.status).toBe(409);
  });

  it('lost → replace issues a linked ACTIVE band and retires the old one', async () => {
    const reg = await registerBand();
    const id = reg.body.data._id as string;
    await request(app).post(`/api/bands/${id}/assign`).set('Authorization', auth()).send({ userId: fx.operatorA.id });
    await request(app).post(`/api/bands/${id}/activate`).set('Authorization', auth());
    await request(app).post(`/api/bands/${id}/mark-lost`).set('Authorization', auth());

    const rep = await request(app)
      .post(`/api/bands/${id}/replace`)
      .set('Authorization', auth())
      .send({ nfcUid: '04:77:1D:4E:5A:81', reason: 'Lost at cafeteria' });
    expect(rep.status).toBe(201);
    expect(rep.body.data.new.status).toBe('ACTIVE');
    expect(rep.body.data.new.replacementFor).toBe(id);
    expect(rep.body.data.old.status).toBe('DECOMMISSIONED');

    const avail = await registerBand({ nfcUid: '04:C9:02:77:1F:80', bandId: 'NF-1000' });
    const badReplace = await request(app)
      .post(`/api/bands/${avail.body.data._id}/replace`)
      .set('Authorization', auth())
      .send({ nfcUid: '04:11:11:11:11:11', reason: 'No longer needed' });
    expect(badReplace.status).toBe(409);
  });

  it('OPERATOR cannot register bands; cross-org reads are 404', async () => {
    const denied = await request(app)
      .post('/api/bands')
      .set('Authorization', `Bearer ${fx.operatorA.token}`)
      .send({ nfcUid: UID, type: 'STUDENT' });
    expect(denied.status).toBe(403);

    const reg = await registerBand();
    const cross = await request(app)
      .get(`/api/bands/${reg.body.data._id}`)
      .set('Authorization', `Bearer ${fx.adminB.token}`);
    expect(cross.status).toBe(404);
  });
});
