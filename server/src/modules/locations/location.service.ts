import mongoose from 'mongoose';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import type { AuthContext } from '../../middleware/auth.js';
import { writeAudit } from '../audit/audit.service.js';
import { Gate, Location, Zone } from './location.models.js';

interface Ctx {
  ip?: string;
  ua?: string;
  requestId?: string;
}

export const locationService = {
  async listLocations(auth: AuthContext, q: { page: number; pageSize: number; status?: string }) {
    const scope = orgFilter(auth);
    const filter: Record<string, unknown> = { ...scope };
    if (q.status) filter.status = q.status;
    const total = await Location.countDocuments(filter);
    const items = await Location.find(filter).sort({ name: 1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean();
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },

  async createLocation(auth: AuthContext, input: Record<string, unknown>, ctx: Ctx) {
    const scope = orgFilter(auth);
    try {
      const loc = await Location.create({ organizationId: scope.organizationId, ...input });
      await writeAudit({
        organizationId: scope.organizationId, actorId: auth.userId, action: 'LOCATION_CREATED',
        entityType: 'Location', entityId: String(loc._id), newState: input,
        ipAddress: ctx.ip, userAgent: ctx.ua, requestId: ctx.requestId,
      });
      return loc.toObject();
    } catch (e: unknown) {
      if ((e as { code?: number }).code === 11000) throw new ApiError(409, 'CONFLICT', 'Location code already exists');
      throw e;
    }
  },

  async updateLocation(auth: AuthContext, id: string, patch: Record<string, unknown>, ctx: Ctx) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Location not found');
    const scope = orgFilter(auth);
    const loc = await Location.findOne({ _id: id, ...scope });
    if (!loc) throw new ApiError(404, 'NOT_FOUND', 'Location not found');
    Object.assign(loc, patch);
    await loc.save();
    await writeAudit({
      organizationId: scope.organizationId, actorId: auth.userId, action: 'LOCATION_UPDATED',
      entityType: 'Location', entityId: String(loc._id), newState: patch,
      ipAddress: ctx.ip, userAgent: ctx.ua, requestId: ctx.requestId,
    });
    return loc.toObject();
  },

  /** Full hierarchy for pickers and the access page: locations with zones and gates. */
  async tree(auth: AuthContext) {
    const scope = orgFilter(auth);
    const [locations, zones, gates] = await Promise.all([
      Location.find({ ...scope, status: 'ACTIVE' }).sort({ name: 1 }).lean(),
      Zone.find({ ...scope, status: 'ACTIVE' }).sort({ name: 1 }).lean(),
      Gate.find({ ...scope, status: 'ACTIVE' }).sort({ name: 1 }).lean(),
    ]);
    return locations.map((l) => ({
      ...l,
      zones: zones
        .filter((z) => String(z.locationId) === String(l._id))
        .map((z) => ({ ...z, gates: gates.filter((g) => String(g.zoneId) === String(z._id)) })),
      gates: gates.filter((g) => String(g.locationId) === String(l._id) && !g.zoneId),
    }));
  },

  async createZone(auth: AuthContext, input: { locationId: string; name: string; code: string }) {
    const scope = orgFilter(auth);
    const loc = await Location.findOne({ _id: input.locationId, ...scope }).select('_id').lean();
    if (!loc) throw new ApiError(404, 'NOT_FOUND', 'Location not found');
    try {
      const zone = await Zone.create({ organizationId: scope.organizationId, ...input });
      return zone.toObject();
    } catch (e: unknown) {
      if ((e as { code?: number }).code === 11000) throw new ApiError(409, 'CONFLICT', 'Zone code already exists in this location');
      throw e;
    }
  },

  async createGate(auth: AuthContext, input: { locationId: string; zoneId?: string; name: string; code: string; direction?: string }) {
    const scope = orgFilter(auth);
    const loc = await Location.findOne({ _id: input.locationId, ...scope }).select('_id').lean();
    if (!loc) throw new ApiError(404, 'NOT_FOUND', 'Location not found');
    if (input.zoneId) {
      const zone = await Zone.findOne({ _id: input.zoneId, ...scope, locationId: input.locationId }).select('_id').lean();
      if (!zone) throw new ApiError(404, 'NOT_FOUND', 'Zone not found in this location');
    }
    try {
      const gate = await Gate.create({ organizationId: scope.organizationId, ...input });
      await writeAudit({
        organizationId: scope.organizationId, actorId: auth.userId, action: 'GATE_CREATED',
        entityType: 'Gate', entityId: String(gate._id), newState: { name: input.name, code: input.code },
      });
      return gate.toObject();
    } catch (e: unknown) {
      if ((e as { code?: number }).code === 11000) throw new ApiError(409, 'CONFLICT', 'Gate code already exists in this location');
      throw e;
    }
  },

  async updateGate(auth: AuthContext, id: string, patch: Record<string, unknown>) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Gate not found');
    const scope = orgFilter(auth);
    const gate = await Gate.findOne({ _id: id, ...scope });
    if (!gate) throw new ApiError(404, 'NOT_FOUND', 'Gate not found');
    Object.assign(gate, patch);
    await gate.save();
    return gate.toObject();
  },
};
