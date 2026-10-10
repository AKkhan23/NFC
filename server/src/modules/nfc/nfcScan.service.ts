import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/errors.js';
import type { AuthContext } from '../../middleware/auth.js';
import { emitToOrg } from '../../sockets/index.js';
import { writeAudit } from '../audit/audit.service.js';
import { attendanceService } from '../attendance/attendance.service.js';
import { AccessEvent } from '../access/access.models.js';
import { accessService, type AccessDecision } from '../access/access.service.js';
import { NFCBand } from '../bands/band.model.js';
import { notify } from '../notifications/notification.service.js';
import { eventService } from '../events/event.service.js';
import { walletService } from '../wallets/wallet.service.js';
import { NFCDevice } from '../devices/device.model.js';
import { Gate, Location } from '../locations/location.models.js';
import { Organization } from '../organizations/organization.model.js';
import { User } from '../users/user.model.js';
import { NFCScan, type SCAN_RESULTS } from './nfcScan.model.js';
import { actorIdOrUndefined } from '../../utils/actors.js';
import { getAdapter } from './nfcReader.service.js';
import type { ScanInput } from './nfc.validators.js';

type ScanResult = (typeof SCAN_RESULTS)[number];

interface ScanUser {
  _id: unknown;
  firstName: string;
  lastName: string;
  status: string;
  role: string;
}

interface Ctx {
  ip?: string;
  ua?: string;
  requestId?: string;
}

function messageFor(action: string, result: ScanResult, reason?: string): string {
  if (result === 'SUCCESS') {
    switch (action) {
      case 'CHECK_IN': return 'Checked in';
      case 'CHECK_OUT': return 'Checked out';
      case 'ENTRY': return 'Access granted';
      case 'EXIT': return 'Exit recorded';
      case 'EVENT_CHECK_IN': return 'Event check-in recorded';
      case 'IDENTIFY': return 'Identity verified';
      default: return 'Scan successful';
    }
  }
  return reason ?? 'Scan denied';
}

/**
 * §12 pipeline: normalize → idempotency → device/location checks → band → user →
 * decision → duplicate guard → record scan → side effects → audit → socket emit.
 * Controllers stay thin; everything lives here.
 */
export const nfcScanService = {
  async process(auth: AuthContext, input: ScanInput, ctx: Ctx, adapterType: 'keyboard' | 'bridge' = 'keyboard') {
    const organizationId = auth.organizationId;
    const now = new Date();

    // 1. Normalize UID through the reader adapter (format validation lives here).
    const adapter = getAdapter(adapterType);
    const nfcUid = adapter.normalize(input.nfcUid);

    // 2. Strong idempotency: same client key replays the original scan, no new row.
    const effectiveRequestId = input.requestId ?? ctx.requestId;
    if (effectiveRequestId) {
      const prior = await NFCScan.findOne({ organizationId, requestId: effectiveRequestId }).lean();
      if (prior) {
        return { ...toResult(prior), replay: true, duplicate: false, statusCode: 200 };
      }
    }

    // 3. Validate device / location / gate (server-side — never trust client claims).
    const device = input.deviceId
      ? await NFCDevice.findOne({ _id: input.deviceId, organizationId }).lean()
      : null;
    if (input.deviceId && !device) throw new ApiError(404, 'NOT_FOUND', 'Device not found');
    if (input.locationId) {
      const loc = await Location.findOne({ _id: input.locationId, organizationId }).select('_id timezone').lean();
      if (!loc) throw new ApiError(404, 'NOT_FOUND', 'Location not found');
    }
    if (input.gateId) {
      const gate = await Gate.findOne({ _id: input.gateId, organizationId }).select('_id').lean();
      if (!gate) throw new ApiError(404, 'NOT_FOUND', 'Gate not found');
    }

    // 4. Duplicate guard: same band + reader + action inside the window → replay original.
    const org = await Organization.findById(organizationId).select('settings').lean();
    const windowMs = org?.settings?.dupScanWindowMs ?? env.NFC_DUP_WINDOW_MS;
    const recent = await NFCScan.findOne({
      organizationId,
      nfcUid,
      ...(device ? { deviceId: device._id } : { deviceId: { $exists: false } }),
      action: input.action,
    })
      .sort({ timestamp: -1 })
      .lean();
    if (recent && now.getTime() - new Date(recent.timestamp).getTime() < windowMs) {
      return { ...toResult(recent), replay: false, duplicate: true, statusCode: 200 };
    }

    // 5. Resolve band → user and decide.
    const band = await NFCBand.findOne({ organizationId, nfcUid });
    let result: ScanResult = 'SUCCESS';
    let failureReason: string | undefined;
    let user: ScanUser | null = null;

    if (!band) {
      result = 'UNKNOWN';
      failureReason = 'Band is not registered';
    } else {
      // Auto-expire stale ACTIVE bands once, with audit.
      if (band.status === 'ACTIVE' && band.expiresAt && band.expiresAt.getTime() < now.getTime()) {
        band.status = 'EXPIRED';
        await band.save();
        await writeAudit({
          organizationId,
          actorId: auth.userId,
          action: 'BAND_AUTO_EXPIRED',
          entityType: 'NFCBand',
          entityId: String(band._id),
          previousState: { status: 'ACTIVE' },
          newState: { status: 'EXPIRED' },
          requestId: ctx.requestId,
        });
      }
      const status = band.status as string;
      if (status === 'BLOCKED') { result = 'BLOCKED'; failureReason = band.blockedReason ?? 'Band is blocked'; }
      else if (status === 'LOST') { result = 'LOST'; failureReason = 'Band is reported lost'; }
      else if (status === 'EXPIRED') { result = 'EXPIRED'; failureReason = 'Band has expired'; }
      else if (status === 'DAMAGED' || status === 'DECOMMISSIONED') { result = 'INVALID'; failureReason = `Band is ${status.toLowerCase()}`; }
      else if ((status === 'AVAILABLE' || status === 'ASSIGNED') && input.action !== 'IDENTIFY') {
        result = 'INVALID'; failureReason = 'Band is not activated';
      }

      if (band.userId) {
        const found = await User.findOne({ _id: band.userId, organizationId })
          .select('firstName lastName status role')
          .lean();
        user = found as unknown as ScanUser | null;
      }
      if (result === 'SUCCESS') {
        if (band.userId && !user) { result = 'INVALID'; failureReason = 'Assigned user no longer exists'; }
        else if (user && user.status !== 'ACTIVE') { result = 'DENIED'; failureReason = 'User account is disabled'; }
        else if (device && (device.status === 'OFFLINE' || device.status === 'MAINTENANCE')) {
          result = 'ERROR'; failureReason = `Device is ${device.status.toLowerCase()}`;
        } else if (input.action === 'PAYMENT') {
          if (!input.amountMinor) { result = 'INVALID'; failureReason = 'Amount is required for payments'; }
          else if (!user) { result = 'INVALID'; failureReason = 'Band has no wallet holder'; }
        }
      }
    }

    // 5b. Rule-based access decision for ENTRY / EVENT_CHECK_IN (secure default-deny).
    // EXIT is always allowed but still recorded. Other actions skip access rules.
    let access: AccessDecision | undefined;
    const scanEventId = typeof input.metadata?.eventId === 'string' ? (input.metadata.eventId as string) : undefined;
    if (band && result === 'SUCCESS' && (input.action === 'ENTRY' || input.action === 'EVENT_CHECK_IN')) {
      access = await accessService.evaluate({
        organizationId,
        userId: user ? String(user._id) : undefined,
        userRole: user?.role,
        bandStatus: band.status as string,
        gateId: input.gateId,
        locationId: input.locationId,
        eventId: scanEventId,
        at: now,
      });
      if (access.decision === 'DENY') {
        result = 'DENIED';
        failureReason = access.reason;
      }
    } else if (input.action === 'EXIT') {
      access = { decision: 'ALLOW', reason: 'Exit is always permitted' };
    }

    // 5c. NFC payment: debit synchronously so the scan verdict reflects funds.
    // Idempotency key derives from the scan requestId — retries share one ledger row.
    let paymentTxn: Record<string, unknown> | undefined;
    if (input.action === 'PAYMENT' && result === 'SUCCESS' && user && input.amountMinor) {
      try {
        const out = await walletService.debit({
          organizationId,
          userId: String(user._id),
          amountMinor: input.amountMinor,
          actorId: auth.userId,
          idempotencyKey: `scan:${effectiveRequestId}`,
          reason: 'NFC payment',
          ctx,
        });
        paymentTxn = out.txn as Record<string, unknown>;
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'INSUFFICIENT_BALANCE' || e.code === 'WALLET_FROZEN')) {
          result = 'DENIED';
          failureReason = e.code === 'INSUFFICIENT_BALANCE' ? 'Insufficient wallet balance' : 'Wallet is frozen';
        } else {
          throw e;
        }
      }
      // A racing request with the same key may have recorded while we debited.
      if (effectiveRequestId) {
        const raced = await NFCScan.findOne({ organizationId, requestId: effectiveRequestId }).lean();
        if (raced) {
          return { ...toResult(raced), replay: true, duplicate: false, statusCode: 200 as const };
        }
      }
    }

    // 6. Record the immutable scan row.
    const scan = await NFCScan.create({
      organizationId,
      nfcUid,
      bandId: band?._id,
      userId: user?._id ?? band?.userId,
      deviceId: device?._id,
      locationId: input.locationId,
      gateId: input.gateId,
      action: input.action,
      result,
      failureReason,
      operatorId: actorIdOrUndefined(auth.userId),
      timestamp: now,
      requestId: effectiveRequestId,
      metadata: {
        ...(input.metadata ?? {}),
        ...(paymentTxn?._id ? { walletTransactionId: String(paymentTxn._id) } : {}),
        ...(actorIdOrUndefined(auth.userId) ? {} : { apiKey: auth.userId }),
      },
    });

    // 7. Side effects (best-effort: failures are logged, never fail the scan response).
    // Exception: event capacity denials rewrite the verdict (row already patched inside).
    let sideEffect: Record<string, unknown> = {};
    let scanDoc: Record<string, unknown> = scan.toObject();
    if (['CHECK_IN', 'CHECK_OUT', 'ENTRY', 'EXIT', 'EVENT_CHECK_IN'].includes(input.action)) {
      try {
        sideEffect = await applySideEffects(auth, input, band, user, scan._id as mongoose.Types.ObjectId, result, now, access, ctx);
      } catch (e) {
        logger.error({ err: e, scanId: String(scan._id) }, 'scan side effect failed');
      }
      if (typeof sideEffect.eventDenied === 'string') {
        result = 'DENIED';
        failureReason = sideEffect.eventDenied;
        const updated = await NFCScan.findById(scan._id).lean();
        if (updated) scanDoc = updated as unknown as Record<string, unknown>;
      }
    }

    // 8. Audit + realtime.
    await writeAudit({
      organizationId,
      actorId: auth.userId,
      action: `NFC_SCAN_${input.action}`,
      entityType: 'NFCScan',
      entityId: String(scan._id),
      newState: { nfcUid, action: input.action, result, failureReason },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
      requestId: ctx.requestId,
    });

    emitToOrg(organizationId, 'nfc.scan', {
      scanId: String(scan._id),
      nfcUid,
      bandId: band?.bandId ?? null,
      user: user ? `${user.firstName} ${user.lastName}` : null,
      action: input.action,
      result,
      timestamp: now.toISOString(),
    });

    // Alert the holder when their band is refused for safety reasons.
    if ((result === 'BLOCKED' || result === 'LOST') && user) {
      await notify({
        organizationId,
        userId: String(user._id),
        type: result === 'BLOCKED' ? 'BAND_BLOCKED' : 'BAND_LOST',
        title: result === 'BLOCKED' ? 'Your band was declined: blocked' : 'Your band was declined: reported lost',
        body: failureReason,
        priority: 'HIGH',
        data: { scanId: String(scan._id) },
      });
    }

    return {
      ...toResult(scanDoc),
      message: messageFor(input.action, result, failureReason),
      replay: false,
      duplicate: false,
      statusCode: 201 as const,
      ...sideEffect,
      ...(paymentTxn ? { walletTransaction: paymentTxn } : {}),
    };
  },

  async list(auth: AuthContext, q: { page: number; pageSize: number; nfcUid?: string; action?: string; result?: string; deviceId?: string; from?: string; to?: string }) {
    const filter: Record<string, unknown> = { organizationId: auth.organizationId };
    if (q.nfcUid) filter.nfcUid = q.nfcUid.toUpperCase();
    if (q.action) filter.action = q.action;
    if (q.result) filter.result = q.result;
    if (q.deviceId) filter.deviceId = q.deviceId;
    if (q.from ?? q.to) {
      filter.timestamp = {
        ...(q.from ? { $gte: new Date(q.from) } : {}),
        ...(q.to ? { $lte: new Date(q.to) } : {}),
      };
    }
    const total = await NFCScan.countDocuments(filter);
    const items = await NFCScan.find(filter).sort({ timestamp: -1 })
      .skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean();
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },

  /**
   * Phone-tap check-in via per-band secret link (no login — the token is the credential).
   * Tap card URL -> browser opens /t/:token -> this records a CHECK_IN through the
   * same pipeline (dedupe + attendance + audit). Only ACTIVE bands with a holder qualify.
   */
  async tapCheckIn(token: string, ctx: Ctx) {
    const band = await NFCBand.findOne({ tapToken: token }).lean();
    if (!band) throw new ApiError(404, 'NOT_FOUND', 'This tap link is invalid. Ask your administrator for a new one.');
    if (band.status !== 'ACTIVE') {
      throw new ApiError(409, 'INVALID_STATE', `Cannot check in: band ${band.bandId} is ${String(band.status).toLowerCase()}.`);
    }
    if (!band.userId) throw new ApiError(409, 'INVALID_STATE', 'Cannot check in: band has no holder yet.');
    const holder = await User.findById(band.userId).select('firstName lastName status').lean();
    if (!holder) throw new ApiError(409, 'INVALID_STATE', 'Cannot check in: holder account no longer exists.');

    const tapAuth: AuthContext = {
      userId: String(band.userId),
      organizationId: String(band.organizationId),
      role: 'TAP_LINK',
      permissions: [],
    };
    const out = await nfcScanService.process(
      tapAuth,
      { nfcUid: band.nfcUid, action: 'CHECK_IN' },
      ctx,
      'keyboard',
    );
    return {
      result: out.result,
      message: out.message,
      bandId: band.bandId,
      name: `${(holder as { firstName: string }).firstName} ${(holder as { lastName: string }).lastName}`,
      at: new Date().toISOString(),
      statusCode: out.statusCode,
    };
  },
};

function toResult(scan: Record<string, unknown> | object) {
  const s = scan as Record<string, unknown>;
  return {
    scan: s,
    result: s.result as ScanResult,
    message: messageFor(String(s.action), s.result as ScanResult, s.failureReason as string | undefined),
  };
}

async function applySideEffects(
  auth: AuthContext,
  input: ScanInput,
  band: { _id: unknown } | null,
  user: ScanUser | null,
  scanId: mongoose.Types.ObjectId,
  result: ScanResult,
  now: Date,
  access: AccessDecision | undefined,
  ctx: Ctx,
): Promise<Record<string, unknown>> {
  const userId = user ? String(user._id) : undefined;
  const bandId = band ? String(band._id) : undefined;

  if (input.action === 'CHECK_IN' && userId && result === 'SUCCESS') {
    const attendance = await attendanceService.checkIn(
      auth,
      { userId, bandId, locationId: input.locationId, at: now, method: 'NFC' },
      ctx,
    );
    return { attendance };
  }
  if (input.action === 'CHECK_OUT' && userId && result === 'SUCCESS') {
    const attendance = await attendanceService.checkOut(
      auth,
      { userId, bandId, locationId: input.locationId, at: now, method: 'NFC' },
      ctx,
    );
    return { attendance };
  }
  if ((input.action === 'ENTRY' || input.action === 'EXIT' || input.action === 'EVENT_CHECK_IN') && userId) {
    // Event capacity is enforced atomically; a full event denies the check-in.
    if (input.action === 'EVENT_CHECK_IN' && result === 'SUCCESS') {
      const meta = input.metadata as Record<string, unknown> | undefined;
      const eventId = typeof meta?.eventId === 'string' ? meta.eventId : undefined;
      if (eventId) {
        try {
          await eventService.checkIn(auth, eventId, userId, {
            scanId: String(scanId),
            idempotencyKey: typeof ctx.requestId === 'string' ? ctx.requestId : undefined,
            ctx,
          });
        } catch (e) {
          if (e instanceof ApiError) {
            await NFCScan.updateOne({ _id: scanId }, { $set: { result: 'DENIED', failureReason: e.message } });
            return { eventDenied: e.message };
          }
          throw e;
        }
      }
    }
    const decision = access?.decision ?? (result === 'SUCCESS' ? 'ALLOW' : 'DENY');
    const ev = await AccessEvent.create({
      organizationId: auth.organizationId,
      userId: new mongoose.Types.ObjectId(userId),
      bandId: band?._id,
      gateId: input.gateId,
      locationId: input.locationId,
      direction: input.action === 'EXIT' ? 'EXIT' : 'ENTRY',
      decision,
      ruleId: access?.ruleId,
      reason: decision === 'DENY' ? (access?.reason ?? `Scan result: ${result}`) : undefined,
      scanId,
      operatorId: actorIdOrUndefined(auth.userId),
      timestamp: now,
    });
    return { accessEvent: ev.toObject() };
  }
  return {};
}
