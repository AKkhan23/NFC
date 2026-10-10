import mongoose from 'mongoose';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import type { AuthContext } from '../../middleware/auth.js';
import { writeAudit } from '../audit/audit.service.js';
import { emitToOrg } from '../../sockets/index.js';
import { Location } from '../locations/location.models.js';
import { NFCScan } from '../nfc/nfcScan.model.js';
import { User } from '../users/user.model.js';
import { OrgEvent } from './event.model.js';
import { assertFeature, assertSubscriptionWritable } from '../billing/subscription.js';

interface Ctx {
  ip?: string;
  ua?: string;
  requestId?: string;
}

/** Event permissions reuse the access.* family (no separate events.* scope). */
export const eventService = {
  async list(auth: AuthContext, q: { page: number; pageSize: number; status?: string; upcoming?: boolean }) {
    const scope = orgFilter(auth);
    const filter: Record<string, unknown> = { ...scope };
    if (q.status) filter.status = q.status;
    if (q.upcoming) filter.startAt = { $gte: new Date() };
    const total = await OrgEvent.countDocuments(filter);
    const items = await OrgEvent.find(filter).sort({ startAt: 1 })
      .skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean();
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },

  async create(auth: AuthContext, input: Record<string, unknown>, ctx: Ctx) {
    const scope = orgFilter(auth);
    await assertSubscriptionWritable(scope.organizationId);
    await assertFeature(scope.organizationId, 'events');
    if (input.locationId) {
      const loc = await Location.findOne({ _id: input.locationId, ...scope }).select('_id').lean();
      if (!loc) throw new ApiError(404, 'NOT_FOUND', 'Location not found');
    }
    const ev = await OrgEvent.create({ organizationId: scope.organizationId, createdBy: auth.userId, ...input });
    await writeAudit({
      organizationId: scope.organizationId, actorId: auth.userId, action: 'EVENT_CREATED',
      entityType: 'Event', entityId: String(ev._id), newState: { name: input.name },
      ipAddress: ctx.ip, userAgent: ctx.ua, requestId: ctx.requestId,
    });
    return ev.toObject();
  },

  async update(auth: AuthContext, id: string, patch: Record<string, unknown>, ctx: Ctx) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Event not found');
    const scope = orgFilter(auth);
    const ev = await OrgEvent.findOne({ _id: id, ...scope });
    if (!ev) throw new ApiError(404, 'NOT_FOUND', 'Event not found');
    Object.assign(ev, patch);
    await ev.save();
    await writeAudit({
      organizationId: scope.organizationId, actorId: auth.userId, action: 'EVENT_UPDATED',
      entityType: 'Event', entityId: String(ev._id), newState: patch,
      ipAddress: ctx.ip, userAgent: ctx.ua, requestId: ctx.requestId,
    });
    return ev.toObject();
  },

  /**
   * Manual or NFC-driven check-in with capacity enforcement.
   * NFC path: called from the scan pipeline with the scan's requestId as idempotency key.
   */
  async checkIn(
    auth: AuthContext,
    eventId: string,
    userId: string,
    opts: { scanId?: string; idempotencyKey?: string; ctx?: Ctx } = {},
  ) {
    if (!mongoose.Types.ObjectId.isValid(eventId)) throw new ApiError(404, 'NOT_FOUND', 'Event not found');
    const scope = orgFilter(auth);
    const ev = await OrgEvent.findOne({ _id: eventId, ...scope });
    if (!ev) throw new ApiError(404, 'NOT_FOUND', 'Event not found');
    if (!['PUBLISHED', 'ONGOING'].includes(ev.status)) {
      throw new ApiError(409, 'INVALID_STATE', `Event is ${ev.status.toLowerCase()}`);
    }
    const user = await User.findOne({ _id: userId, ...scope }).select('_id role status').lean();
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
    if (user.status !== 'ACTIVE') throw new ApiError(409, 'INVALID_STATE', 'User is not active');
    if (ev.allowedGroups.length > 0 && !ev.allowedGroups.includes(user.role)) {
      throw new ApiError(403, 'ACCESS_DENIED', 'User group is not allowed for this event');
    }

    // Idempotent per user+event via the scan ledger (NFC) or a fresh EVENT row check (manual).
    if (opts.idempotencyKey) {
      const prior = await NFCScan.findOne({ organizationId: scope.organizationId, requestId: opts.idempotencyKey })
        .select('_id').lean();
      if (prior) return { event: ev.toObject(), duplicate: true as const };
    } else {
      const priorManual = await NFCScan.findOne({
        organizationId: scope.organizationId,
        userId,
        action: 'EVENT_CHECK_IN',
        'metadata.eventId': eventId,
      })
        .select('_id').lean();
      if (priorManual) throw new ApiError(409, 'DUPLICATE_SCAN', 'User is already checked in to this event');
    }

    // Atomic capacity guard.
    if (ev.capacity !== undefined && ev.capacity !== null) {
      const res = await OrgEvent.updateOne(
        { _id: ev._id, checkedInCount: { $lt: ev.capacity } },
        { $inc: { checkedInCount: 1 } },
      );
      if (res.matchedCount === 0) throw new ApiError(409, 'CONFLICT', 'Event is at capacity');
    } else {
      await OrgEvent.updateOne({ _id: ev._id }, { $inc: { checkedInCount: 1 } });
    }

    const fresh = await OrgEvent.findById(ev._id).lean();
    emitToOrg(scope.organizationId, 'event.checkin', { eventId: String(ev._id), userId, checkedInCount: fresh?.checkedInCount });
    return { event: fresh, duplicate: false as const };
  },
};
