import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/database/connection.js';
import { Organization } from '../src/modules/organizations/organization.model.js';
import { User } from '../src/modules/users/user.model.js';
import { hashPassword, signAccessToken } from '../src/modules/auth/auth.tokens.js';
import { ROLE_PERMISSIONS, type RoleName } from '../src/modules/permissions/permissions.constants.js';

export const app = createApp();

let mongo: MongoMemoryServer | undefined;

export async function startDb(): Promise<void> {
  mongo = await MongoMemoryServer.create({
    instance: { dbVersion: process.env.MONGOMS_VERSION ?? '6.0.26' },
  });
  await connectDb(mongo.getUri('nfc_test'));
  // Unique constraints only hold once indexes exist; background builds are racy in tests.
  await mongoose.connection.syncIndexes();
}

export async function stopDb(): Promise<void> {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await disconnectDb();
  await mongo?.stop();
}

export async function clearDb(): Promise<void> {
  // deleteMany (not dropDatabase) so indexes built by syncIndexes survive between tests.
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export interface Fixture {
  orgA: { id: string };
  orgB: { id: string };
  adminA: { id: string; email: string; password: string; token: string };
  operatorA: { id: string; email: string; password: string; token: string };
  adminB: { id: string; email: string; password: string; token: string };
}

function tokenFor(userId: string, orgId: string, role: RoleName): string {
  return signAccessToken({ sub: userId, org: orgId, role, perms: ROLE_PERMISSIONS[role] });
}

export async function seedFixtures(): Promise<Fixture> {
  const password = 'TestPass123!';
  const passwordHash = await hashPassword(password);

  const orgA = await Organization.create({ name: 'Alpha School', slug: 'alpha-school' });
  const orgB = await Organization.create({ name: 'Beta College', slug: 'beta-college' });

  async function mkUser(orgId: unknown, email: string, role: RoleName, firstName: string) {
    const u = await User.create({
      organizationId: orgId,
      email,
      passwordHash,
      firstName,
      lastName: 'Fixture',
      role,
      permissions: [],
      status: 'ACTIVE',
    });
    return {
      id: String(u._id),
      email,
      password,
      token: tokenFor(String(u._id), String(orgId), role),
    };
  }

  return {
    orgA: { id: String(orgA._id) },
    orgB: { id: String(orgB._id) },
    adminA: await mkUser(orgA._id, 'admin@alpha.example', 'ADMIN', 'Asha'),
    operatorA: await mkUser(orgA._id, 'operator@alpha.example', 'OPERATOR', 'Omar'),
    adminB: await mkUser(orgB._id, 'admin@beta.example', 'ADMIN', 'Bala'),
  };
}

export { request };
