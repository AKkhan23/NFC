import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AuthContext } from '../../middleware/auth.js';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import { writeAudit } from '../audit/audit.service.js';
import { User } from '../users/user.model.js';
import { NFCScan } from '../nfc/nfcScan.model.js';
import { emitToOrg } from '../../sockets/index.js';
import { VisitorPass } from './visitor.model.js';
import { assertFeature, assertSubscriptionWritable } from '../billing/subscription.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createPassSchema = z.object({
  body: z.object({
    kind: z.enum(['VISITOR', 'DAY_QR']).default('VISITOR'),
    name: z.string().trim().min(1).max(160),
    phone: z.string().max(32).optional(),
    purpose: z.string().max(500).optional(),
    userId: objectId.optional(),
    validTo: z.string().datetime().optional(),
    maxUses: z.coerce.number().int().min(1).max(100).default(1),
  }),
});

export const checkinSchema = z.object({
  body: z.object({
    token: z.string().regex(/^[0-9a-f]{64}$/, 'Invalid pass code'),
  }),
});

export const passParamsSchema = z.object({
  params: z.object({ id: objectId }),
});

function endOfDay(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export const visitorService = {
  async create(auth: AuthContext, input: { kind: 'VISITOR' | 'DAY_QR'; name: string; phone?: string; purpose?: string; userId?: string; validTo?: string; maxUses: number }) {
    const scope = orgFilter(auth);
    await assertSubscriptionWritable(scope.organizationId);
    await assertFeature(scope.organizationId, 'visitors');
    if (input.userId) {
      const holder = await User.findOne({ _id: input.userId, organizationId: scope.organizationId }).select('_id').lean();
      if (!holder) throw new ApiError(404, 'NOT_FOUND', 'User not found');
    }
    const pass = await VisitorPass.create({
      organizationId: scope.organizationId,
      token: randomBytes(32).toString('hex'),
      kind: input.kind,
      name: input.name,
      phone: input.phone,
      purpose: input.purpose,
      userId: input.userId,
      validFrom: new Date(),
      validTo: input.validTo ? new Date(input.validTo) : endOfDay(),
      maxUses: input.maxUses,
      createdBy: auth.userId,
    });
    await writeAudit({
      organizationId: scope.organizationId,
      actorId: auth.userId,
      action: 'VISITOR_PASS_ISSUED',
      entityType: 'VisitorPass',
      entityId: String(pass._id),
      newState: { kind: input.kind, name: input.name },
    });
    const created = pass.toObject() as Record<string, unknown> & { token: string };
    return { ...created, checkinUrl: `/v/${created.token}` };
  },

  async list(auth: AuthContext, q: { page: number; pageSize: number; status?: string; kind?: string }) {
    const scope = orgFilter(auth);
    const filter: Record<string, unknown> = { ...scope };
    if (q.status) filter.status = q.status;
    if (q.kind) filter.kind = q.kind;
    const total = await VisitorPass.countDocuments(filter);
    const items = await VisitorPass.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean();
    return { items: items.map((p) => ({ ...p, token: undefined })), page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },

  async get(auth: AuthContext, id: string) {
    const scope = orgFilter(auth);
    const pass = await VisitorPass.findOne({ _id: id, organizationId: scope.organizationId }).lean();
    if (!pass) throw new ApiError(404, 'NOT_FOUND', 'Pass not found');
    return { ...pass, checkinUrl: `/v/${pass.token}` };
  },

  async revoke(auth: AuthContext, id: string) {
    const scope = orgFilter(auth);
    const pass = await VisitorPass.findOne({ _id: id, organizationId: scope.organizationId });
    if (!pass) throw new ApiError(404, 'NOT_FOUND', 'Pass not found');
    pass.status = 'REVOKED';
    await pass.save();
    await writeAudit({
      organizationId: scope.organizationId,
      actorId: auth.userId,
      action: 'VISITOR_PASS_REVOKED',
      entityType: 'VisitorPass',
      entityId: String(pass._id),
    });
    return pass.toObject();
  },

  /** Gate check-in: validates window/uses, records an ENTRY scan row, emits socket event. */
  async checkin(auth: AuthContext, token: string) {
    // Token lookup must be org-scoped to avoid cross-org oracle — try caller's org first,
    // fall back to global lookup only to return generic 404 (no existence leak across orgs).
    let pass = await VisitorPass.findOne({ token, organizationId: auth.organizationId });
    if (!pass) {
      const anywhere = await VisitorPass.findOne({ token }).select('_id').lean();
      if (anywhere) throw new ApiError(404, 'NOT_FOUND', 'Pass not found');
      throw new ApiError(404, 'NOT_FOUND', 'Pass not found');
    }
    const now = new Date();
    if (pass.status === 'REVOKED') throw new ApiError(409, 'INVALID_STATE', 'Pass has been revoked');
    if (pass.status === 'EXPIRED' || now > pass.validTo) {
      pass.status = 'EXPIRED';
      await pass.save();
      throw new ApiError(409, 'INVALID_STATE', 'Pass has expired');
    }
    if (now < pass.validFrom) throw new ApiError(409, 'INVALID_STATE', 'Pass is not yet valid');
    if (pass.usedCount >= pass.maxUses) throw new ApiError(409, 'INVALID_STATE', 'Pass has already been used');

    pass.usedCount += 1;
    pass.lastUsedAt = now;
    await pass.save();

    const scan = await NFCScan.create({
      organizationId: auth.organizationId,
      nfcUid: `VISITOR:${pass.token.slice(0, 8).toUpperCase()}`,
      userId: pass.userId,
      action: 'ENTRY',
      result: 'SUCCESS',
      operatorId: auth.userId,
      timestamp: now,
      requestId: `visitor_${String(pass._id)}_${pass.usedCount}`,
      metadata: { visitorPassId: String(pass._id), kind: pass.kind, name: pass.name },
    });

    await writeAudit({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      action: 'VISITOR_PASS_CHECKIN',
      entityType: 'VisitorPass',
      entityId: String(pass._id),
      newState: { usedCount: pass.usedCount },
    });
    emitToOrg(auth.organizationId, 'visitor.checkin', {
      passId: String(pass._id),
      name: pass.name,
      kind: pass.kind,
      usedCount: pass.usedCount,
      scanId: String(scan._id),
    });
    return { pass: pass.toObject(), scan: scan.toObject() };
  },

  /** Public gate verification (no login — token is the credential, same as tap links). */
  async verifyPublic(token: string) {
    const pass = await VisitorPass.findOne({ token }).select('kind name validFrom validTo maxUses usedCount status').lean();
    if (!pass) throw new ApiError(404, 'NOT_FOUND', 'This pass link is invalid.');
    const now = new Date();
    const valid = pass.status === 'ACTIVE' && now >= pass.validFrom && now <= pass.validTo && pass.usedCount < pass.maxUses;
    return { ...pass, valid, now: now.toISOString() };
  },
};
