import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const { model, models } = mongoose;
export const DEVICE_STATUSES = ['ONLINE', 'OFFLINE', 'WARNING', 'MAINTENANCE'] as const;
export const ADAPTER_TYPES = ['keyboard', 'pcsc', 'serial', 'network', 'vendor', 'bridge'] as const;

const nfcDeviceSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Human id, e.g. DEV-MAIN-GATE-01. Unique per organization. */
    deviceId: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    type: { type: String, enum: ['FIXED', 'HANDHELD', 'KIOSK'], default: 'FIXED', index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', index: true },
    gateId: { type: Schema.Types.ObjectId, ref: 'Gate', index: true },
    status: { type: String, enum: DEVICE_STATUSES, default: 'OFFLINE', index: true },
    lastHeartbeat: { type: Date, index: true },
    firmware: { type: String, maxlength: 64 },
    ipAddress: { type: String, maxlength: 64 },
    adapterType: { type: String, enum: ADAPTER_TYPES, default: 'keyboard' },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

nfcDeviceSchema.index({ organizationId: 1, deviceId: 1 }, { unique: true });
nfcDeviceSchema.index({ organizationId: 1, status: 1 });
nfcDeviceSchema.index({ organizationId: 1, locationId: 1 });

export type NFCDeviceDoc = InferSchemaType<typeof nfcDeviceSchema> & { _id: unknown };
export const NFCDevice: Model<NFCDeviceDoc> =
  (models.NFCDevice as Model<NFCDeviceDoc> | undefined) ?? model<NFCDeviceDoc>('NFCDevice', nfcDeviceSchema);
