import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const { model, models } = mongoose;
export const SCAN_ACTIONS = [
  'CHECK_IN',
  'CHECK_OUT',
  'ENTRY',
  'EXIT',
  'PAYMENT',
  'IDENTIFY',
  'EVENT_CHECK_IN',
] as const;

export const SCAN_RESULTS = [
  'SUCCESS',
  'DENIED',
  'BLOCKED',
  'LOST',
  'EXPIRED',
  'UNKNOWN',
  'INVALID',
  'ERROR',
] as const;

/**
 * Immutable scan ledger. Services must only ever `create` — never update/delete.
 * `requestId` carries the client idempotency key; unique per org for payments.
 */
const nfcScanSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    nfcUid: { type: String, required: true, uppercase: true, trim: true, index: true },
    bandId: { type: Schema.Types.ObjectId, ref: 'NFCBand', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'NFCDevice', index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', index: true },
    gateId: { type: Schema.Types.ObjectId, ref: 'Gate', index: true },
    action: { type: String, enum: SCAN_ACTIONS, required: true, index: true },
    result: { type: String, enum: SCAN_RESULTS, required: true, index: true },
    failureReason: { type: String, maxlength: 500 },
    operatorId: { type: Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: () => new Date(), index: true },
    /** Client-supplied idempotency key (X-Request-Id). */
    requestId: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

nfcScanSchema.index({ organizationId: 1, timestamp: -1 });
nfcScanSchema.index({ organizationId: 1, nfcUid: 1, timestamp: -1 });
nfcScanSchema.index({ organizationId: 1, deviceId: 1, timestamp: -1 });
// Same band + same device + same action dedupe lookups.
nfcScanSchema.index({ organizationId: 1, nfcUid: 1, deviceId: 1, action: 1, timestamp: -1 });

export type NFCScanDoc = InferSchemaType<typeof nfcScanSchema>;
export const NFCScan: Model<NFCScanDoc> =
  (models.NFCScan as Model<NFCScanDoc> | undefined) ?? model<NFCScanDoc>('NFCScan', nfcScanSchema);
