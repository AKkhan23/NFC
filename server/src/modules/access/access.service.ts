import mongoose from 'mongoose';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import { dayKey, partsInTz } from '../../utils/time.js';
import type { AuthContext } from '../../middleware/auth.js';
import { writeAudit } from '../audit/audit.service.js';
import { Gate, Location } from '../locations/location.models.js';
import { AccessEvent, AccessRule } from './access.models.js';
import type { CreateRuleInput } from './access.validators.js';

interface Ctx {
  ip?: string;
  ua?: string;
  requestId?: string;
}

export interface AccessDecision {
  decision: 'ALLOW' | 'DENY';
  ruleId?: string;
  reason: string;
}

export interface EvaluateInput {
  organizationId: string;
  userId?: string;
  userRole?: string;
  bandStatus: string;
  gateId?: string;
  locationId?: string;
  eventId?: string;
  at?: Date;
}

async function assertScope(organizationId: string, locationId?: string | null, gateId?: string | null): Promise<void> {
  if (locationId) {
    const loc = await Location.findOne({ _id: locationId, organizationId }).select('_id').lean();
    if (!loc) throw new ApiError(404, 'NOT_FOUND', 'Location not found');
  }
  if (gateId) {
    const gate = await Gate.findOne({ _id: gateId, organizationId }).select('_id').lean();
    if (!gate) throw new ApiError(404, 'NOT_FOUND', 'Gate not found');
  }
}

export const accessService = {
  async listRules(auth: AuthContext, q: { page: number; pageSize: number; gateId?: string; locationId?: string; status?: string }) {
    const scope = orgFilter(auth);
    const filter: Record<string, unknown> = { ...scope };
    if (q.gateId) filter.gateId = q.gateId;
    if (q.locationId) filter.locationId = q.locationId;
    if (q.status) filter.status = q.status;
    const total = await AccessRule.countDocuments(filter);
    const items = await AccessRule.find(filter).sort({ priority: 1, createdAt: -1 })
      .skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean();
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },

  async createRule(auth: AuthContext, input: CreateRuleInput, ctx: Ctx) {
    const scope = orgFilter(auth);
    await assertScope(scope.organizationId, input.locationId, input.gateId);
    const rule = await AccessRule.create({ organizationId: scope.organizationId, ...input });
    await writeAudit({
      organizationId: scope.organizationId,
      actorId: auth.userId,
      action: 'ACCESS_RULE_CREATED',
      entityType: 'AccessRule',
      entityId: String(rule._id),
      newState: { name: input.name, effect: input.effect },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
      requestId: ctx.requestId,
    });
    return rule.toObject();
  },

  async updateRule(auth: AuthContext, id: string, patch: Record<string, unknown>, ctx: Ctx) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Access rule not found');
    const scope = orgFilter(auth);
    const rule = await AccessRule.findOne({ _id: id, ...scope });
    if (!rule) throw new ApiError(404, 'NOT_FOUND', 'Access rule not found');
    await assertScope(
      scope.organizationId,
      (patch.locationId as string | null | undefined) ?? undefined,
      (patch.gateId as string | null | undefined) ?? undefined,
    );
    const previousState = { effect: rule.effect, status: rule.status };
    Object.assign(rule, patch);
    await rule.save();
    await writeAudit({
      organizationId: scope.organizationId,
      actorId: auth.userId,
      action: 'ACCESS_RULE_UPDATED',
      entityType: 'AccessRule',
      entityId: String(rule._id),
      previousState,
      newState: patch,
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
      requestId: ctx.requestId,
    });
    return rule.toObject();
  },

  async listEvents(auth: AuthContext, q: { page: number; pageSize: number; gateId?: string; locationId?: string; decision?: string; from?: string; to?: string }) {
    const scope = orgFilter(auth);
    const filter: Record<string, unknown> = { ...scope };
    if (q.gateId) filter.gateId = q.gateId;
    if (q.locationId) filter.locationId = q.locationId;
    if (q.decision) filter.decision = q.decision;
    if (q.from ?? q.to) {
      filter.timestamp = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
    }
    const total = await AccessEvent.countDocuments(filter);
    const items = await AccessEvent.find(filter)
      .populate('userId', 'firstName lastName email')
      .sort({ timestamp: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean();
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },

  /**
   * Evaluate access rules. DENY rules (priority ascending) win over ALLOW.
   * Secure default: no matching rule → DENY. Time/day are evaluated in the
   * location timezone so gate PCs and the server can disagree on clocks safely.
   */
  async evaluate(input: EvaluateInput): Promise<AccessDecision> {
    const at = input.at ?? new Date();
    let tz = 'UTC';
    if (input.locationId) {
      const loc = await Location.findOne({ _id: input.locationId, organizationId: input.organizationId })
        .select('timezone')
        .lean();
      if (loc?.timezone) tz = loc.timezone;
    }
    const parts = partsInTz(at, tz);
    const today = dayKey(parts.dow);

    // Scope: gate-specific → location-wide → global, all ACTIVE.
    const scopeOr: Record<string, unknown>[] = [{ gateId: { $exists: false }, locationId: { $exists: false } }];
    if (input.locationId) scopeOr.push({ locationId: input.locationId, gateId: { $exists: false } });
    if (input.gateId) scopeOr.push({ gateId: input.gateId });
    const rules = (
      await AccessRule.find({
        organizationId: input.organizationId,
        status: 'ACTIVE',
        $or: scopeOr,
      }).lean()
    ).sort((a, b) =>
      a.effect === b.effect ? a.priority - b.priority : a.effect === 'DENY' ? -1 : 1,
    );

    for (const rule of rules) {
      if (!rule.days.includes(today as 'MON')) continue;
      if (parts.time < rule.startTime || parts.time > rule.endTime) continue;
      if (rule.userGroups.length > 0 || rule.userIds.length > 0) {
        const inGroups = input.userRole ? rule.userGroups.includes(input.userRole) : false;
        const inUsers = input.userId ? rule.userIds.map(String).includes(input.userId) : false;
        if (!inGroups && !inUsers) continue;
      }
      if (!rule.bandStatuses.includes(input.bandStatus)) continue;
      if (rule.eventId && String(rule.eventId) !== input.eventId) continue;
      return {
        decision: rule.effect as 'ALLOW' | 'DENY',
        ruleId: String(rule._id),
        reason: rule.effect === 'ALLOW' ? `Allowed by rule "${rule.name}"` : `Denied by rule "${rule.name}"`,
      };
    }
    return { decision: 'DENY', reason: 'No access rule permits this entry' };
  },
};
