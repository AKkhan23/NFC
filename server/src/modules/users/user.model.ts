import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const { model, models } = mongoose;
const userSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'SECURITY', 'FINANCE', 'VIEWER', 'STUDENT'],
      required: true,
      index: true,
    },
    permissions: { type: [String], default: [] },
    status: { type: String, enum: ['ACTIVE', 'DISABLED', 'INVITED'], default: 'ACTIVE', index: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

// Org-scoped unique email (SUPER_ADMIN users still belong to an org for scoping).
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: unknown };
/** Idempotent registration: safe under test re-imports and dev hot-reload. */
export const User: Model<UserDoc> =
  (models.User as Model<UserDoc> | undefined) ?? model<UserDoc>('User', userSchema);
