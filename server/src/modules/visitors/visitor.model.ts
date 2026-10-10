import mongoose, { Schema, type Model } from 'mongoose';

const { model, models } = mongoose;

/**
 * Visitor / day-pass QR. Token IS the credential (64-hex, like tap links).
 * Covers visitors AND holders who forgot their band (linked via userId).
 */
const visitorPassSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    kind: { type: String, enum: ['VISITOR', 'DAY_QR'], required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 32 },
    purpose: { type: String, trim: true, maxlength: 500 },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    validFrom: { type: Date, required: true, index: true },
    validTo: { type: Date, required: true, index: true },
    maxUses: { type: Number, default: 1, min: 1, max: 100 },
    usedCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['ACTIVE', 'REVOKED', 'EXPIRED'], default: 'ACTIVE', index: true },
    lastUsedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

visitorPassSchema.index({ organizationId: 1, createdAt: -1 });
visitorPassSchema.index({ organizationId: 1, status: 1, validTo: 1 });

export type VisitorPassDoc = {
  _id: unknown;
  organizationId: unknown;
  token: string;
  kind: 'VISITOR' | 'DAY_QR';
  name: string;
  phone?: string;
  purpose?: string;
  userId?: unknown;
  validFrom: Date;
  validTo: Date;
  maxUses: number;
  usedCount: number;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  lastUsedAt?: Date;
  createdBy: unknown;
};

export const VisitorPass: Model<VisitorPassDoc> =
  (models.VisitorPass as Model<VisitorPassDoc> | undefined) ?? model<VisitorPassDoc>('VisitorPass', visitorPassSchema);
