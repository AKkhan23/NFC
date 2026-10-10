import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { AuthContext } from '../../middleware/auth.js';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import { writeAudit } from '../audit/audit.service.js';
import { Organization } from '../organizations/organization.model.js';
import { PERMISSIONS } from '../permissions/permissions.constants.js';
import { assertFeature } from './subscription.js';

export const createKeySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(60),
    permissions: z.array(z.enum(PERMISSIONS)).min(1).max(PERMISSIONS.length),
  }),
});

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

type KeyRow = Record<string, unknown>;

function keyRows(org: { apiKeys?: unknown }): KeyRow[] {
  return (org.apiKeys ?? []) as unknown as KeyRow[];
}

export const apiKeyService = {
  /** Mint a key. Requires the apiAccess feature. The raw key is shown ONCE. */
  async create(auth: AuthContext, input: { name: string; permissions: string[] }) {
    const scope = orgFilter(auth);
    await assertFeature(scope.organizationId, 'apiAccess');
    const org = await Organization.findById(scope.organizationId);
    if (!org) throw new ApiError(404, 'NOT_FOUND', 'Organization not found');
    const rows = keyRows(org);
    if (rows.length >= 20) throw new ApiError(409, 'INVALID_STATE', 'API key limit reached (20) — revoke an unused key first');
    const prefix = randomBytes(4).toString('hex');
    const secret = randomBytes(24).toString('hex');
    const prefix0 = prefix;
    const secret0 = secret;
    rows.push({
      name: input.name,
      prefix: prefix0,
      keyHash: hashSecret(secret0),
      permissions: input.permissions,
      createdAt: new Date(),
    });
    org.markModified('apiKeys');
    await org.save();
    const created = keyRows(org).find((k) => k.prefix === prefix0) as KeyRow;
    await writeAudit({
      organizationId: scope.organizationId,
      actorId: auth.userId,
      action: 'API_KEY_CREATED',
      entityType: 'Organization',
      entityId: scope.organizationId,
      newState: { keyId: String(created._id), name: input.name, permissions: input.permissions },
    });
    return { key: `ak_${prefix0}_${secret0}`, keyId: String(created._id), name: input.name, prefix: prefix0, permissions: input.permissions };
  },

  async list(auth: AuthContext) {
    const scope = orgFilter(auth);
    const org = await Organization.findById(scope.organizationId).select('apiKeys').lean();
    const items = keyRows(org ?? {}).map((k) => ({
      _id: String(k._id),
      name: k.name,
      prefix: k.prefix,
      permissions: k.permissions,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    }));
    return { items };
  },

  async revoke(auth: AuthContext, keyId: string) {
    const scope = orgFilter(auth);
    const org = await Organization.findById(scope.organizationId);
    if (!org) throw new ApiError(404, 'NOT_FOUND', 'Organization not found');
    const kept = keyRows(org).filter((k) => String(k._id) !== keyId);
    if (kept.length === keyRows(org).length) throw new ApiError(404, 'NOT_FOUND', 'API key not found');
    org.set('apiKeys', kept);
    await org.save();
    await writeAudit({
      organizationId: scope.organizationId,
      actorId: auth.userId,
      action: 'API_KEY_REVOKED',
      entityType: 'Organization',
      entityId: scope.organizationId,
      newState: { keyId },
    });
    return { revoked: keyId };
  },
};

/** Resolve an `ak_<prefix>_<secret>` header into an org-scoped service identity. */
export async function authFromApiKey(raw: string): Promise<AuthContext | null> {
  const m = /^ak_([0-9a-f]{8})_([0-9a-f]{48})$/.exec(raw.trim());
  if (!m) return null;
  const [, prefix, secret] = m;
  const org = await Organization.findOne({ 'apiKeys.prefix': prefix }).select('_id status apiKeys');
  if (!org || (org.status as string) !== 'ACTIVE') return null;
  const keys = keyRows(org);
  const match = keys.find((k) => k.prefix === prefix);
  if (!match) return null;
  const expected = Buffer.from(String(match.keyHash), 'hex');
  const actual = Buffer.from(hashSecret(secret), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  Organization.updateOne(
    { _id: org._id, 'apiKeys.prefix': prefix },
    { $set: { 'apiKeys.$.lastUsedAt': new Date() } },
  ).exec().catch(() => undefined);
  return {
    userId: `apikey:${String(match._id)}`,
    organizationId: String(org._id),
    role: 'API_KEY',
    permissions: (match.permissions as string[]) ?? [],
  };
}
