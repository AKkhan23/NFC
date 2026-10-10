import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const { model, models } = mongoose;

const profileLinkSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 40 },
    url: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false },
);

/**
 * Public tap profile (digital business card). The page at `/p/:slug` is intentionally
 * public — that is the product — so only shareable contact fields live here.
 * Visibility is controlled with `isPublic` (no delete API: printed cards must not 404
 * by accident; unpublish instead).
 */
const profileSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    title: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 32 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    whatsapp: { type: String, trim: true, maxlength: 32 },
    website: { type: String, trim: true, maxlength: 500 },
    links: { type: [profileLinkSchema], default: [] },
    photoUrl: { type: String, trim: true, maxlength: 1000 },
    isPublic: { type: Boolean, default: true, index: true },
    views: { type: Number, default: 0, min: 0 },
    lastViewedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

profileSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
profileSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export type ProfileDoc = InferSchemaType<typeof profileSchema> & { _id: unknown };
/** Idempotent registration: safe under test re-imports and dev hot-reload. */
export const Profile: Model<ProfileDoc> =
  (models.Profile as Model<ProfileDoc> | undefined) ?? model<ProfileDoc>('Profile', profileSchema);
