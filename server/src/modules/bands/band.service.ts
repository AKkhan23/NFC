import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import type { AuthContext } from '../../middleware/auth.js';
import { writeAudit } from '../audit/audit.service.js';
import { notify } from '../notifications/notification.service.js';
import { User } from '../users/user.model.js';
import { NFCBand } from './band.model.js';
import type { AssignBandInput, RegisterBandInput, ReplaceBandInput } from './band.validators.js';
import { assertSubscriptionWritable, assertWithinLimit } from '../billing/subscription.js';

type BandStatus =
  | 'AVAILABLE' | 'ASSIGNED' | 'ACTIVE' | 'BLOCKED'
  | 'LOST' | 'DAMAGED' | 'EXPIRED' | 'DECOMMISSIONED';

/** Tight transition map. Lost/damaged bands must go through `replace`, never silent reactivation. */
const TRANSITIONS: Record<BandStatus, BandStatus[]> = {
  AVAILABLE: ['ASSIGNED', 'DECOMMISSIONED'],
  ASSIGNED: ['ACTIVE', 'BLOCKED', 'DECOMMISSIONED'],
  ACTIVE: ['BLOCKED', 'LOST', 'DAMAGED', 'EXPIRED', 'DECOMMISSIONED'],
  BLOCKED: ['ACTIVE', 'LOST', 'DAMAGED', 'DECOMMISSIONED'],
  LOST: ['DECOMMISSIONED'],
  DAMAGED: ['DECOMMISSIONED'],
  EXPIRED: ['ACTIVE', 'DECOMMISSIONED'],
  DECOMMISSIONED: [],
};

function assertTransition(from: BandStatus, to: BandStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new ApiError(409, 'INVALID_STATE', `Cannot move band from ${from} to ${to}`);
  }
}

function auditCtx(req: { ip?: string; ua?: string; requestId?: string }) {
  return req;
}

async function generateBandId(organizationId: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = `NF-${Math.floor(1000 + Math.random() * 9000)}`;
    const exists = await NFCBand.findOne({ organizationId, bandId: candidate }).select('_id').lean();
    if (!exists) return candidate;
  }
  throw new ApiError(500, 'INTERNAL_ERROR', 'Could not allocate a band id');
}

interface Ctx {
  ip?: string;
  ua?: string;
  requestId?: string;
}

async function transition(
  auth: AuthContext,
  id: string,
  to: BandStatus,
  patch: Record<string, unknown>,
  auditAction: string,
  ctx: Ctx,
) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Band not found');
  const scope = orgFilter(auth);
  const band = await NFCBand.findOne({ _id: id, ...scope });
  if (!band) throw new ApiError(404, 'NOT_FOUND', 'Band not found');
  const from = band.status as BandStatus;
  assertTransition(from, to);
  const previousState = { status: from, userId: band.userId ? String(band.userId) : null };
  Object.assign(band, { status: to, updatedBy: new mongoose.Types.ObjectId(auth.userId), ...patch });
  await band.save();
  await writeAudit({
    organizationId: String(band.organizationId),
    actorId: auth.userId,
    action: auditAction,
    entityType: 'NFCBand',
    entityId: String(band._id),
    previousState,
    newState: { status: to, ...patch, userId: undefined },
    ipAddress: ctx.ip,
    userAgent: ctx.ua,
    requestId: ctx.requestId,
  });
  if (to === 'BLOCKED' || to === 'LOST') {
    await notify({
      organizationId: String(band.organizationId),
      type: to === 'BLOCKED' ? 'BAND_BLOCKED' : 'BAND_LOST',
      title: to === 'BLOCKED' ? `Band ${band.bandId} blocked` : `Band ${band.bandId} reported lost`,
      body: to === 'BLOCKED' ? String(patch.blockedReason ?? 'Blocked by administrator') : 'Replacement workflow required',
      priority: 'HIGH',
      data: { bandId: String(band._id) },
    });
  }
  return band.toObject();
}

export const bandService = {
  async list(auth: AuthContext, q: { page: number; pageSize: number; search?: string; status?: string; type?: string; userId?: string }) {
    const scope = orgFilter(auth);
    const filter: Record<string, unknown> = { ...scope };
    if (q.status) filter.status = q.status;
    if (q.type) filter.type = q.type;
    if (q.userId) filter.userId = q.userId;
    if (q.search) {
      const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ bandId: rx }, { nfcUid: rx }];
    }
    const total = await NFCBand.countDocuments(filter);
    const items = await NFCBand.find(filter)
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean();
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },

  async get(auth: AuthContext, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Band not found');
    const band = await NFCBand.findOne({ _id: id, ...orgFilter(auth) })
      .populate('userId', 'firstName lastName email role status')
      .populate('assignedLocationId', 'name code')
      .lean();
    if (!band) throw new ApiError(404, 'NOT_FOUND', 'Band not found');
    return band;
  },

  async register(auth: AuthContext, input: RegisterBandInput, ctx: Ctx) {
    const scope = orgFilter(auth);
    await assertSubscriptionWritable(scope.organizationId);
    await assertWithinLimit(scope.organizationId, 'bands');
    const nfcUid = input.nfcUid.toUpperCase();
    const dupe = await NFCBand.findOne({ nfcUid }).select('_id').lean();
    if (dupe) throw new ApiError(409, 'CONFLICT', 'NFC UID is already registered');
    const bandId = (input.bandId ?? (await generateBandId(scope.organizationId))).toUpperCase();
    const bandIdTaken = await NFCBand.findOne({ ...scope, bandId }).select('_id').lean();
    if (bandIdTaken) throw new ApiError(409, 'CONFLICT', 'Band ID already exists in this organization');

    const band = await NFCBand.create({
      organizationId: scope.organizationId,
      bandId,
      nfcUid,
      type: input.type,
      status: 'AVAILABLE',
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      assignedLocationId: input.assignedLocationId,
      metadata: input.metadata,
      createdBy: auth.userId,
    });
    await writeAudit({
      organizationId: scope.organizationId,
      actorId: auth.userId,
      action: 'BAND_REGISTERED',
      entityType: 'NFCBand',
      entityId: String(band._id),
      newState: { bandId, nfcUid, type: input.type },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
      requestId: ctx.requestId,
    });
    return band.toObject();
  },

  async assign(auth: AuthContext, id: string, input: AssignBandInput, ctx: Ctx) {
    const scope = orgFilter(auth);
    const user = await User.findOne({ _id: input.userId, ...scope }).select('_id status').lean();
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
    if (user.status !== 'ACTIVE') throw new ApiError(409, 'INVALID_STATE', 'Cannot assign a band to a non-active user');
    return transition(auth, id, 'ASSIGNED', {
      userId: new mongoose.Types.ObjectId(input.userId),
      issuedAt: new Date(),
      ...(input.locationId ? { assignedLocationId: new mongoose.Types.ObjectId(input.locationId) } : {}),
    }, 'BAND_ASSIGNED', auditCtx(ctx));
  },

  async activate(auth: AuthContext, id: string, ctx: Ctx) {
    return transition(auth, id, 'ACTIVE', { activatedAt: new Date() }, 'BAND_ACTIVATED', auditCtx(ctx));
  },

  async block(auth: AuthContext, id: string, reason: string, ctx: Ctx) {
    return transition(auth, id, 'BLOCKED', { blockedAt: new Date(), blockedReason: reason }, 'BAND_BLOCKED', auditCtx(ctx));
  },

  async unblock(auth: AuthContext, id: string, ctx: Ctx) {
    return transition(auth, id, 'ACTIVE', { blockedAt: undefined, blockedReason: undefined }, 'BAND_UNBLOCKED', auditCtx(ctx));
  },

  async markLost(auth: AuthContext, id: string, ctx: Ctx) {
    return transition(auth, id, 'LOST', { lostAt: new Date() }, 'BAND_MARKED_LOST', auditCtx(ctx));
  },

  async markDamaged(auth: AuthContext, id: string, ctx: Ctx) {
    return transition(auth, id, 'DAMAGED', { damagedAt: new Date() }, 'BAND_MARKED_DAMAGED', auditCtx(ctx));
  },

  async deactivate(auth: AuthContext, id: string, ctx: Ctx) {
    return transition(auth, id, 'DECOMMISSIONED', {}, 'BAND_DECOMMISSIONED', auditCtx(ctx));
  },

  /** Create/rotate the phone-tap link token. Anyone with the link can check this band in. */
  async rotateTapLink(auth: AuthContext, id: string, ctx: Ctx) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Band not found');
    const scope = orgFilter(auth);
    const band = await NFCBand.findOne({ _id: id, ...scope });
    if (!band) throw new ApiError(404, 'NOT_FOUND', 'Band not found');
    band.set('tapToken', crypto.randomBytes(32).toString('hex'));
    band.set('updatedBy', new mongoose.Types.ObjectId(auth.userId));
    await band.save();
    await writeAudit({
      organizationId: String(band.organizationId),
      actorId: auth.userId,
      action: 'BAND_TAP_LINK_ROTATED',
      entityType: 'NFCBand',
      entityId: String(band._id),
      newState: { bandId: band.bandId },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
      requestId: ctx.requestId,
    });
    return { tapToken: band.get('tapToken') as string };
  },

  async replace(auth: AuthContext, id: string, input: ReplaceBandInput, ctx: Ctx) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Band not found');
    const scope = orgFilter(auth);
    const old = await NFCBand.findOne({ _id: id, ...scope });
    if (!old) throw new ApiError(404, 'NOT_FOUND', 'Band not found');
    const from = old.status as BandStatus;
    if (from === 'AVAILABLE' || from === 'DECOMMISSIONED') {
      throw new ApiError(409, 'INVALID_STATE', `Cannot replace a ${from} band`);
    }
    const nfcUid = input.nfcUid.toUpperCase();
    if (await NFCBand.findOne({ nfcUid }).select('_id').lean()) {
      throw new ApiError(409, 'CONFLICT', 'Replacement NFC UID is already registered');
    }
    const bandId = (input.bandId ?? (await generateBandId(scope.organizationId))).toUpperCase();

    old.status = 'DECOMMISSIONED';
    old.set('replacementReason', input.reason);
    old.set('updatedBy', new mongoose.Types.ObjectId(auth.userId));
    await old.save();

    const next = await NFCBand.create({
      organizationId: old.organizationId,
      bandId,
      nfcUid,
      type: old.type,
      status: old.userId ? 'ACTIVE' : 'AVAILABLE',
      userId: old.userId,
      issuedAt: new Date(),
      activatedAt: old.userId ? new Date() : undefined,
      expiresAt: old.expiresAt,
      replacementFor: old._id,
      replacementReason: input.reason,
      assignedLocationId: old.assignedLocationId,
      createdBy: auth.userId,
    });

    await writeAudit({
      organizationId: String(old.organizationId),
      actorId: auth.userId,
      action: 'BAND_REPLACED',
      entityType: 'NFCBand',
      entityId: String(next._id),
      previousState: { replacedBandId: String(old._id), status: from },
      newState: { bandId, nfcUid, status: next.status },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
      requestId: ctx.requestId,
    });
    return { old: old.toObject(), new: next.toObject() };
  },
};
