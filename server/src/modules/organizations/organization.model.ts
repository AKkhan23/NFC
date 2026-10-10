import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
const { model, models } = mongoose;

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE', index: true },
    contactEmail: { type: String, trim: true },
    billingEmail: { type: String, trim: true, maxlength: 160 },
    subscription: {
      plan: { type: String, default: 'TRIAL', index: true },
      status: { type: String, enum: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'], default: 'TRIALING', index: true },
      trialEndsAt: { type: Date, default: () => new Date(Date.now() + 14 * 24 * 3600 * 1000) },
      periodEnd: { type: Date },
      graceUntil: { type: Date },
      provider: { type: String, enum: ['MANUAL', 'RAZORPAY', 'STRIPE'], default: 'MANUAL' },
      providerId: { type: String, maxlength: 160, index: true },
      /** Super-admin per-feature grants/denials. Present keys override the plan matrix. */
      featureOverrides: { type: Map, of: Boolean, default: undefined },
    },
    apiKeys: {
      type: [{
        name: { type: String, required: true, trim: true, maxlength: 60 },
        prefix: { type: String, required: true, index: true },
        keyHash: { type: String, required: true },
        permissions: { type: [String], required: true },
        createdAt: { type: Date, default: Date.now },
        lastUsedAt: { type: Date },
      }],
      default: [],
    },
    settings: {
      timezone: { type: String, default: 'UTC' },
      attendanceLateAfter: { type: String, default: '09:30' },
      attendanceDayEnd: { type: String, default: '17:00' },
      dupScanWindowMs: { type: Number, default: 3000 },
      upiPayeeVpa: { type: String, default: '', trim: true, maxlength: 160 },
      upiPayeeName: { type: String, default: '', trim: true, maxlength: 160 },
      minTopupMinor: { type: Number, default: 1000, min: 1 },
      maxTopupMinor: { type: Number, default: 1000000, min: 1 },
      posMenu: {
        type: [{ name: { type: String, required: true, trim: true, maxlength: 60 }, priceMinor: { type: Number, required: true, min: 1, max: 10000000 }, _id: false }],
        default: [],
      },
    },
  },
  { timestamps: true },
);

organizationSchema.index({ name: 1 });

export type OrganizationDoc = InferSchemaType<typeof organizationSchema> & { _id: unknown };
/** Idempotent registration: safe under test re-imports and dev hot-reload. */
export const Organization: Model<OrganizationDoc> =
  (models.Organization as Model<OrganizationDoc> | undefined) ??
  model<OrganizationDoc>('Organization', organizationSchema);
