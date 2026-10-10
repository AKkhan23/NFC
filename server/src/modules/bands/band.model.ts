import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const { model, models } = mongoose;
export const BAND_STATUSES = [
  'AVAILABLE',
  'ASSIGNED',
  'ACTIVE',
  'BLOCKED',
  'LOST',
  'DAMAGED',
  'EXPIRED',
  'DECOMMISSIONED',
] as const;

export const BAND_TYPES = ['STUDENT', 'STAFF', 'VISITOR', 'VENDOR', 'VIP', 'TEMPORARY'] as const;

const nfcBandSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Human-readable id, e.g. NF-4821. Unique per organization. */
    bandId: { type: String, required: true, trim: true, uppercase: true },
    /** Hardware UID from the tag. Globally unique — UIDs are burned into silicon. */
    nfcUid: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },
    type: { type: String, enum: BAND_TYPES, required: true, index: true },
    status: { type: String, enum: BAND_STATUSES, default: 'AVAILABLE', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    issuedAt: { type: Date },
    activatedAt: { type: Date },
    expiresAt: { type: Date, index: true },
    blockedAt: { type: Date },
    blockedReason: { type: String, maxlength: 500 },
    lostAt: { type: Date },
    damagedAt: { type: Date },
    replacementFor: { type: Schema.Types.ObjectId, ref: 'NFCBand' },
    replacementReason: { type: String, maxlength: 500 },
    assignedLocationId: { type: Schema.Types.ObjectId, ref: 'Location' },
    /** Secret phone-tap link token (tap card URL -> check-in without login). Rotatable. */
    tapToken: { type: String, unique: true, sparse: true, index: true },
    metadata: { type: Schema.Types.Mixed },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

nfcBandSchema.index({ organizationId: 1, bandId: 1 }, { unique: true });
nfcBandSchema.index({ organizationId: 1, status: 1 });
nfcBandSchema.index({ organizationId: 1, userId: 1 });
nfcBandSchema.index({ organizationId: 1, type: 1, status: 1 });

export type NFCBandDoc = InferSchemaType<typeof nfcBandSchema> & { _id: unknown };
/** Idempotent registration: safe under test re-imports and dev hot-reload. */
export const NFCBand: Model<NFCBandDoc> =
  (models.NFCBand as Model<NFCBandDoc> | undefined) ?? model<NFCBandDoc>('NFCBand', nfcBandSchema);
