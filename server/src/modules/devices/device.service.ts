import mongoose from 'mongoose';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import type { AuthContext } from '../../middleware/auth.js';
import { emitToOrg } from '../../sockets/index.js';
import { writeAudit } from '../audit/audit.service.js';
import { NFCScan } from '../nfc/nfcScan.model.js';
import { NFCDevice } from './device.model.js';

/** A device whose heartbeat is older than this is reported OFFLINE (computed, not stored). */
export const HEARTBEAT_TTL_MS = 5 * 60 * 1000;

export function derivedStatus(device: { status: string; lastHeartbeat?: Date | null }): string {
  if (device.status === 'MAINTENANCE' || device.status === 'WARNING') return device.status;
  if (!device.lastHeartbeat) return 'OFFLINE';
  return Date.now() - new Date(device.lastHeartbeat).getTime() > HEARTBEAT_TTL_MS ? 'OFFLINE' : device.status;
}

export const deviceService = {
  async list(auth: AuthContext, q: { page: number; pageSize: number; status?: string; locationId?: string }) {
    const scope = orgFilter(auth);
    const filter: Record<string, unknown> = { ...scope };
    if (q.locationId) filter.locationId = q.locationId;
    const total = await NFCDevice.countDocuments(filter);
    let items = (
      await NFCDevice.find(filter).sort({ name: 1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean()
    ).map((d) => ({ ...d, health: derivedStatus(d) }));
    if (q.status) items = items.filter((d) => d.health === q.status || d.status === q.status);
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },

  async register(auth: AuthContext, input: Record<string, unknown>) {
    const scope = orgFilter(auth);
    try {
      const device = await NFCDevice.create({ organizationId: scope.organizationId, status: 'OFFLINE', ...input });
      await writeAudit({
        organizationId: scope.organizationId,
        actorId: auth.userId,
        action: 'DEVICE_REGISTERED',
        entityType: 'NFCDevice',
        entityId: String(device._id),
        newState: { deviceId: input.deviceId, name: input.name },
      });
      return device.toObject();
    } catch (e: unknown) {
      if ((e as { code?: number }).code === 11000) throw new ApiError(409, 'CONFLICT', 'Device ID already exists');
      throw e;
    }
  },

  async update(auth: AuthContext, id: string, patch: Record<string, unknown>) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Device not found');
    const scope = orgFilter(auth);
    const device = await NFCDevice.findOne({ _id: id, ...scope });
    if (!device) throw new ApiError(404, 'NOT_FOUND', 'Device not found');
    Object.assign(device, patch);
    await device.save();
    await writeAudit({
      organizationId: scope.organizationId,
      actorId: auth.userId,
      action: 'DEVICE_UPDATED',
      entityType: 'NFCDevice',
      entityId: String(device._id),
      newState: patch,
    });
    return { ...device.toObject(), health: derivedStatus(device) };
  },

  async heartbeat(auth: AuthContext, id: string, info: { firmware?: string; ipAddress?: string }) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Device not found');
    const scope = orgFilter(auth);
    const device = await NFCDevice.findOne({ _id: id, ...scope });
    if (!device) throw new ApiError(404, 'NOT_FOUND', 'Device not found');
    const was = derivedStatus(device);
    device.lastHeartbeat = new Date();
    if (device.status === 'OFFLINE') device.status = 'ONLINE';
    if (info.firmware) device.firmware = info.firmware;
    if (info.ipAddress) device.ipAddress = info.ipAddress;
    await device.save();
    const now = derivedStatus(device);
    if (was === 'OFFLINE' && now === 'ONLINE') {
      emitToOrg(scope.organizationId, 'device.online', { deviceId: String(device._id), name: device.name });
    }
    return { ...device.toObject(), health: now };
  },

  /** Health overview for the dashboard + device detail stats. */
  async stats(auth: AuthContext, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Device not found');
    const scope = orgFilter(auth);
    const device = await NFCDevice.findOne({ _id: id, ...scope }).lean();
    if (!device) throw new ApiError(404, 'NOT_FOUND', 'Device not found');
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [scans24h, failed24h] = await Promise.all([
      NFCScan.countDocuments({ organizationId: scope.organizationId, deviceId: device._id, timestamp: { $gte: since } }),
      NFCScan.countDocuments({
        organizationId: scope.organizationId,
        deviceId: device._id,
        timestamp: { $gte: since },
        result: { $ne: 'SUCCESS' },
      }),
    ]);
    return { ...device, health: derivedStatus(device), scans24h, failed24h };
  },
};
