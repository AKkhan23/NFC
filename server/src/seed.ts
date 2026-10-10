import mongoose from 'mongoose';
import { connectDb, disconnectDb } from './database/connection.js';
import { Organization } from './modules/organizations/organization.model.js';
import { User } from './modules/users/user.model.js';
import { hashPassword } from './modules/auth/auth.tokens.js';
import { NFCBand } from './modules/bands/band.model.js';
import { AccessRule } from './modules/access/access.models.js';
import { NFCDevice } from './modules/devices/device.model.js';
import { Gate, Location, Zone } from './modules/locations/location.models.js';

export async function seedDatabase(silent = false): Promise<void> {
  const org = await Organization.findOneAndUpdate(
    { slug: 'Eskills' },
    {
      $setOnInsert: {
        name: 'Eskills',
        slug: 'Eskills',
        status: 'ACTIVE',
        contactEmail: 'ops@Eskills.com',
      },
    },
    { upsert: true, new: true },
  );
  const orgId = org._id as mongoose.Types.ObjectId;
  const passwordHash = await hashPassword('Test@123');
  const staff: Array<{ email: string; firstName: string; lastName: string; role: string }> = [
    { email: 'admin@Eskills.com', firstName: 'Akshay', lastName: 'Nagdiya', role: 'ADMIN' },
    { email: 'manager@Eskills.com', firstName: 'Rohan', lastName: 'Verma', role: 'MANAGER' },
    { email: 'operator@Eskills.com', firstName: 'Kavya', lastName: 'Nair', role: 'OPERATOR' },
    { email: 'security@Eskills.com', firstName: 'Arjun', lastName: 'Menon', role: 'SECURITY' },
    { email: 'finance@Eskills.com', firstName: 'Divya', lastName: 'Iyer', role: 'FINANCE' },
  ];
  const users: Record<string, mongoose.Types.ObjectId> = {};
  for (const s of staff) {
    const u = await User.findOneAndUpdate(
      { organizationId: orgId, email: s.email },
      { $setOnInsert: { ...s, organizationId: orgId, passwordHash, status: 'ACTIVE' } },
      { upsert: true, new: true },
    );
    users[s.role] = u._id as mongoose.Types.ObjectId;
  }
  // A few students who hold bands.
  const students = [
    { email: 'akshay@Eskills.com', firstName: 'Akshay', lastName: 'Sharma' },
    { email: 'shivam@Eskills.com', firstName: 'Shivam', lastName: 'Goswami' },
    { email: 'azim@Eskills.com', firstName: 'Azim', lastName: 'Khan' },
  ];
  const studentIds: mongoose.Types.ObjectId[] = [];
  for (const s of students) {
    const u = await User.findOneAndUpdate(
      { organizationId: orgId, email: s.email },
      { $setOnInsert: { ...s, organizationId: orgId, passwordHash, role: 'VIEWER', status: 'ACTIVE' } },
      { upsert: true, new: true },
    );
    studentIds.push(u._id as mongoose.Types.ObjectId);
  }

  const loc = await Location.findOneAndUpdate(
    { organizationId: orgId, code: 'MAIN' },
    { $setOnInsert: { organizationId: orgId, name: 'Main Campus', code: 'MAIN', type: 'CAMPUS', status: 'ACTIVE' } },
    { upsert: true, new: true },
  );
  const zone = await Zone.findOneAndUpdate(
    { organizationId: orgId, locationId: loc._id, code: 'NORTH' },
    { $setOnInsert: { organizationId: orgId, locationId: loc._id, name: 'North Wing', code: 'NORTH', status: 'ACTIVE' } },
    { upsert: true, new: true },
  );
  const gate = await Gate.findOneAndUpdate(
    { organizationId: orgId, locationId: loc._id, code: 'GATE-1' },
    {
      $setOnInsert: {
        organizationId: orgId,
        locationId: loc._id,
        zoneId: zone._id,
        name: 'Main Gate',
        code: 'GATE-1',
        direction: 'BIDIRECTIONAL',
        status: 'ACTIVE',
      },
    },
    { upsert: true, new: true },
  );
  await NFCDevice.findOneAndUpdate(
    { organizationId: orgId, deviceId: 'DEV-MAIN-GATE-01' },
    {
      $setOnInsert: {
        organizationId: orgId,
        deviceId: 'DEV-MAIN-GATE-01',
        name: 'Main Gate Kiosk',
        type: 'KIOSK',
        locationId: loc._id,
        gateId: gate._id,
        status: 'ONLINE',
        adapterType: 'keyboard',
      },
    },
    { upsert: true },
  );
  await AccessRule.findOneAndUpdate(
    { organizationId: orgId, name: 'Main gate open hours' },
    {
      $setOnInsert: {
        organizationId: orgId,
        name: 'Main gate open hours',
        gateId: gate._id,
        locationId: loc._id,
        days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        startTime: '06:00',
        endTime: '22:00',
        bandStatuses: ['ACTIVE'],
        effect: 'ALLOW',
        priority: 100,
        status: 'ACTIVE',
      },
    },
    { upsert: true },
  );

  const bands = [
    { bandId: 'NF-4821', nfcUid: '04:A3:F1:9C:2B:80', userIdx: 0, status: 'ACTIVE' },
    { bandId: 'NF-4822', nfcUid: '04:77:1D:4E:5A:81', userIdx: 1, status: 'ACTIVE' },
    { bandId: 'NF-4823', nfcUid: '04:C9:02:77:1F:80', userIdx: undefined, status: 'AVAILABLE' },
    { bandId: 'NF-4824', nfcUid: '04:DE:AD:BE:EF:00', userIdx: 2, status: 'BLOCKED' },
  ];
  for (const b of bands) {
    await NFCBand.findOneAndUpdate(
      { nfcUid: b.nfcUid },
      {
        $setOnInsert: {
          organizationId: orgId,
          bandId: b.bandId,
          nfcUid: b.nfcUid,
          type: 'STUDENT',
          status: b.status,
          userId: b.userIdx !== undefined ? studentIds[b.userIdx] : undefined,
          issuedAt: b.userIdx !== undefined ? new Date() : undefined,
          activatedAt: b.status === 'ACTIVE' ? new Date() : undefined,
          blockedAt: b.status === 'BLOCKED' ? new Date() : undefined,
          blockedReason: b.status === 'BLOCKED' ? 'Seeded demo: reported lost, under review' : undefined,
          assignedLocationId: loc._id,
          createdBy: users.ADMIN,
        },
      },
      { upsert: true },
    );
  }

  if (!silent) {
    // eslint-disable-next-line no-console
    console.log(`seeded ${org.slug}: admin password is ChangeMe123! (4 demo bands, 1 gate, 1 device)`);
  }
}

const isDirectRun =
  process.argv[1]?.replace(/\\/g, '/').endsWith('seed.ts') ||
  process.argv[1]?.replace(/\\/g, '/').endsWith('seed.js');

if (isDirectRun) {
  connectDb()
    .then(() => seedDatabase())
    .then(async () => {
      await disconnectDb();
      process.exit(0);
    })
    .catch(async (e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      await disconnectDb();
      process.exit(1);
    });
}

