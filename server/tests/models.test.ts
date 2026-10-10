import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { clearDb, seedFixtures, startDb, stopDb, type Fixture } from './helpers.js';
import { NFCBand } from '../src/modules/bands/band.model.js';
import { NFCScan } from '../src/modules/nfc/nfcScan.model.js';
import { Location, Zone, Gate } from '../src/modules/locations/location.models.js';
import { NFCDevice } from '../src/modules/devices/device.model.js';
import { Attendance } from '../src/modules/attendance/attendance.model.js';
import { AccessRule, AccessEvent } from '../src/modules/access/access.models.js';
import { Wallet, WalletTransaction } from '../src/modules/wallets/wallet.models.js';
import { OrgEvent } from '../src/modules/events/event.model.js';
import { Notification } from '../src/modules/notifications/notification.model.js';
import { Role } from '../src/modules/roles/role.model.js';

let fx: Fixture;
const oid = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);

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

describe('database models & constraints', () => {
  it('NFC UID is globally unique; bandId is unique per org only', async () => {
    await NFCBand.create({
      organizationId: oid(fx.orgA.id),
      bandId: 'NF-4821',
      nfcUid: '04:A3:F1:9C:2B:80',
      type: 'STUDENT',
      status: 'AVAILABLE',
      createdBy: oid(fx.adminA.id),
    });
    // Same UID anywhere → reject.
    await expect(
      NFCBand.create({
        organizationId: oid(fx.orgB.id),
        bandId: 'NF-9999',
        nfcUid: '04:A3:F1:9C:2B:80',
        type: 'STUDENT',
        status: 'AVAILABLE',
        createdBy: oid(fx.adminB.id),
      }),
    ).rejects.toThrow();
    // Same bandId in same org → reject; in another org → allowed.
    await expect(
      NFCBand.create({
        organizationId: oid(fx.orgA.id),
        bandId: 'NF-4821',
        nfcUid: '04:77:1D:4E:5A:81',
        type: 'STUDENT',
        status: 'AVAILABLE',
        createdBy: oid(fx.adminA.id),
      }),
    ).rejects.toThrow();
    const other = await NFCBand.create({
      organizationId: oid(fx.orgB.id),
      bandId: 'NF-4821',
      nfcUid: '04:77:1D:4E:5A:81',
      type: 'STAFF',
      status: 'AVAILABLE',
      createdBy: oid(fx.adminB.id),
    });
    expect(other.bandId).toBe('NF-4821');
  });

  it('location → zone → gate hierarchy persists with scoped codes', async () => {
    const loc = await Location.create({ organizationId: oid(fx.orgA.id), name: 'Main Campus', code: 'MAIN' });
    const zone = await Zone.create({
      organizationId: oid(fx.orgA.id),
      locationId: loc._id,
      name: 'North Wing',
      code: 'NORTH',
    });
    const gate = await Gate.create({
      organizationId: oid(fx.orgA.id),
      locationId: loc._id,
      zoneId: zone._id,
      name: 'Main Gate',
      code: 'GATE-1',
    });
    expect(String(gate.zoneId)).toBe(String(zone._id));
    await expect(
      Gate.create({ organizationId: oid(fx.orgA.id), locationId: loc._id, name: 'Dup', code: 'GATE-1' }),
    ).rejects.toThrow();
  });

  it('one wallet per user; ledger rows immutable with unique idempotency keys', async () => {
    const wallet = await Wallet.create({ organizationId: oid(fx.orgA.id), userId: oid(fx.adminA.id) });
    await expect(
      Wallet.create({ organizationId: oid(fx.orgA.id), userId: oid(fx.adminA.id) }),
    ).rejects.toThrow();
    await WalletTransaction.create({
      organizationId: oid(fx.orgA.id),
      walletId: wallet._id,
      userId: oid(fx.adminA.id),
      type: 'CREDIT',
      amountMinor: 50000,
      balanceAfterMinor: 50000,
      idempotencyKey: 'idem-1',
      actorId: oid(fx.adminA.id),
    });
    await expect(
      WalletTransaction.create({
        organizationId: oid(fx.orgA.id),
        walletId: wallet._id,
        userId: oid(fx.adminA.id),
        type: 'CREDIT',
        amountMinor: 50000,
        balanceAfterMinor: 100000,
        idempotencyKey: 'idem-1',
        actorId: oid(fx.adminA.id),
      }),
    ).rejects.toThrow();
  });

  it('one attendance row per user per day; scans/access/events/notifications/roles persist', async () => {
    await Attendance.create({
      organizationId: oid(fx.orgA.id),
      userId: oid(fx.operatorA.id),
      date: '2026-09-03',
      checkInMethod: 'NFC',
      status: 'PRESENT',
    });
    await expect(
      Attendance.create({
        organizationId: oid(fx.orgA.id),
        userId: oid(fx.operatorA.id),
        date: '2026-09-03',
        checkInMethod: 'MANUAL',
        status: 'PRESENT',
      }),
    ).rejects.toThrow();

    const scan = await NFCScan.create({
      organizationId: oid(fx.orgA.id),
      nfcUid: '04:A3:F1:9C:2B:80',
      action: 'ENTRY',
      result: 'SUCCESS',
      requestId: 'req_test_1',
    });
    await AccessEvent.create({
      organizationId: oid(fx.orgA.id),
      direction: 'ENTRY',
      decision: 'ALLOW',
      scanId: scan._id,
    });
    await AccessRule.create({ organizationId: oid(fx.orgA.id), name: 'Morning students', effect: 'ALLOW' });
    await NFCDevice.create({ organizationId: oid(fx.orgA.id), deviceId: 'DEV-01', name: 'Kiosk 1' });
    await OrgEvent.create({
      organizationId: oid(fx.orgA.id),
      name: 'Annual Day',
      startAt: new Date('2026-12-01T09:00:00Z'),
      endAt: new Date('2026-12-01T17:00:00Z'),
      createdBy: oid(fx.adminA.id),
    });
    await Notification.create({
      organizationId: oid(fx.orgA.id),
      type: 'SYSTEM_ALERT',
      title: 'Hello',
    });
    await Role.create({ organizationId: oid(fx.orgA.id), name: 'LIBRARIAN', permissions: ['bands.read'] });

    expect(await NFCScan.countDocuments()).toBe(1);
    expect(await AccessEvent.countDocuments()).toBe(1);
  });
});
