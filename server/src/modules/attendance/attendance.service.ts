import mongoose from 'mongoose';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import { minutesBetween, partsInTz } from '../../utils/time.js';
import type { AuthContext } from '../../middleware/auth.js';
import { writeAudit } from '../audit/audit.service.js';
import { Location } from '../locations/location.models.js';
import { Organization } from '../organizations/organization.model.js';
import { User } from '../users/user.model.js';
import { Attendance } from './attendance.model.js';
import type { ManualAttendanceInput } from './attendance.validators.js';

interface Ctx {
  ip?: string;
  ua?: string;
  requestId?: string;
}

async function orgPolicy(organizationId: string) {
  const org = await Organization.findById(organizationId).select('settings').lean();
  return {
    lateAfter: org?.settings?.attendanceLateAfter ?? '09:30',
    dayEnd: org?.settings?.attendanceDayEnd ?? '17:00',
    tz: org?.settings?.timezone ?? 'UTC',
  };
}

async function resolveTz(organizationId: string, locationId?: string): Promise<string> {
  if (locationId) {
    const loc = await Location.findOne({ _id: locationId, organizationId }).select('timezone').lean();
    if (loc?.timezone) return loc.timezone;
  }
  return (await orgPolicy(organizationId)).tz;
}

async function assertUser(auth: AuthContext, userId: string) {
  const scope = orgFilter(auth);
  const user = await User.findOne({ _id: userId, ...scope }).select('_id status').lean();
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  if (user.status !== 'ACTIVE') throw new ApiError(409, 'INVALID_STATE', 'Cannot record attendance for a non-active user');
}

function auditBase(auth: AuthContext, ctx: Ctx, organizationId: string) {
  return { organizationId, actorId: auth.userId, ipAddress: ctx.ip, userAgent: ctx.ua, requestId: ctx.requestId };
}

export const attendanceService = {
  /** NFC + manual check-in share this path — late detection in the location timezone. */
  async checkIn(
    auth: AuthContext,
    input: { userId: string; bandId?: string; locationId?: string; at?: Date; method?: 'NFC' | 'MANUAL' },
    ctx: Ctx,
  ) {
    await assertUser(auth, input.userId);
    const scope = orgFilter(auth);
    const at = input.at ?? new Date();
    const tz = await resolveTz(scope.organizationId, input.locationId);
    const { date, time } = partsInTz(at, tz);
    const { lateAfter } = await orgPolicy(scope.organizationId);

    const existing = await Attendance.findOne({ ...scope, userId: input.userId, date });
    if (existing) {
      if (!existing.checkInAt) {
        existing.checkInAt = at;
        existing.checkInMethod = input.method ?? 'MANUAL';
        if (minutesBetween(lateAfter, time) > 0) {
          existing.status = 'LATE';
          existing.minutesLate = minutesBetween(lateAfter, time);
        }
        await existing.save();
      }
      return existing.toObject();
    }

    const late = minutesBetween(lateAfter, time) > 0;
    const created = await Attendance.create({
      organizationId: scope.organizationId,
      userId: input.userId,
      bandId: input.bandId,
      locationId: input.locationId,
      date,
      checkInAt: at,
      checkInMethod: input.method ?? 'MANUAL',
      status: late ? 'LATE' : 'PRESENT',
      minutesLate: late ? minutesBetween(lateAfter, time) : 0,
    });
    await writeAudit({
      ...auditBase(auth, ctx, scope.organizationId),
      action: 'ATTENDANCE_CHECK_IN',
      entityType: 'Attendance',
      entityId: String(created._id),
      newState: { userId: input.userId, date, status: created.status },
    });
    return created.toObject();
  },

  async checkOut(
    auth: AuthContext,
    input: { userId: string; bandId?: string; locationId?: string; at?: Date; method?: 'NFC' | 'MANUAL' },
    ctx: Ctx,
  ) {
    await assertUser(auth, input.userId);
    const scope = orgFilter(auth);
    const at = input.at ?? new Date();
    const tz = await resolveTz(scope.organizationId, input.locationId);
    const { date, time } = partsInTz(at, tz);
    const { dayEnd } = await orgPolicy(scope.organizationId);

    const existing = await Attendance.findOne({ ...scope, userId: input.userId, date });
    if (!existing) {
      const created = await Attendance.create({
        organizationId: scope.organizationId,
        userId: input.userId,
        bandId: input.bandId,
        locationId: input.locationId,
        date,
        checkOutAt: at,
        checkOutMethod: input.method ?? 'MANUAL',
        status: 'PRESENT',
        remarks: 'Checkout without check-in',
      });
      return created.toObject();
    }
    existing.checkOutAt = at;
    existing.checkOutMethod = input.method ?? 'MANUAL';
    // Early exit: out more than 60 min before day end.
    if (minutesBetween(time, dayEnd) > 60) {
      existing.status = existing.status === 'LATE' ? 'HALF_DAY' : 'EARLY_EXIT';
    }
    await existing.save();
    await writeAudit({
      ...auditBase(auth, ctx, scope.organizationId),
      action: 'ATTENDANCE_CHECK_OUT',
      entityType: 'Attendance',
      entityId: String(existing._id),
      newState: { userId: input.userId, date, status: existing.status },
    });
    return existing.toObject();
  },

  async manual(auth: AuthContext, input: ManualAttendanceInput, ctx: Ctx) {
    await assertUser(auth, input.userId);
    const scope = orgFilter(auth);
    const doc = await Attendance.findOneAndUpdate(
      { ...scope, userId: input.userId, date: input.date },
      {
        $setOnInsert: { organizationId: scope.organizationId, userId: input.userId, date: input.date },
        $set: {
          ...(input.checkInAt ? { checkInAt: new Date(input.checkInAt), checkInMethod: 'MANUAL' } : {}),
          ...(input.checkOutAt ? { checkOutAt: new Date(input.checkOutAt), checkOutMethod: 'MANUAL' } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
          ...(input.locationId ? { locationId: input.locationId } : {}),
        },
      },
      { upsert: true, new: true },
    );
    await writeAudit({
      ...auditBase(auth, ctx, scope.organizationId),
      action: 'ATTENDANCE_MANUAL',
      entityType: 'Attendance',
      entityId: String(doc._id),
      newState: input,
    });
    return doc.toObject();
  },

  async correct(auth: AuthContext, id: string, patch: Record<string, unknown>, ctx: Ctx) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Attendance not found');
    const scope = orgFilter(auth);
    const doc = await Attendance.findOne({ _id: id, ...scope });
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Attendance not found');
    const previousState = {
      checkInAt: doc.checkInAt,
      checkOutAt: doc.checkOutAt,
      status: doc.status,
      remarks: doc.remarks,
    };
    if (patch.checkInAt !== undefined) doc.checkInAt = patch.checkInAt ? new Date(patch.checkInAt as string) : undefined;
    if (patch.checkOutAt !== undefined) doc.checkOutAt = patch.checkOutAt ? new Date(patch.checkOutAt as string) : undefined;
    if (patch.status !== undefined) doc.status = patch.status as typeof doc.status;
    if (patch.remarks !== undefined) doc.remarks = patch.remarks as string;
    doc.correctedBy = new mongoose.Types.ObjectId(auth.userId);
    await doc.save();
    await writeAudit({
      ...auditBase(auth, ctx, scope.organizationId),
      action: 'ATTENDANCE_CORRECTED',
      entityType: 'Attendance',
      entityId: String(doc._id),
      previousState,
      newState: patch,
    });
    return doc.toObject();
  },

  async list(
    auth: AuthContext,
    q: { page: number; pageSize: number; date?: string; from?: string; to?: string; userId?: string; locationId?: string; status?: string },
  ) {
    const scope = orgFilter(auth);
    const filter: Record<string, unknown> = { ...scope };
    if (q.date) filter.date = q.date;
    else if (q.from ?? q.to) {
      filter.date = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
    }
    if (q.userId) filter.userId = q.userId;
    if (q.locationId) filter.locationId = q.locationId;
    if (q.status) filter.status = q.status;
    const total = await Attendance.countDocuments(filter);
    const items = await Attendance.find(filter)
      .populate('userId', 'firstName lastName email')
      .sort({ date: -1, createdAt: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean();
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },
};
