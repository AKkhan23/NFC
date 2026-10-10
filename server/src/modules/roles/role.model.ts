import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const { model, models } = mongoose;
import { PERMISSIONS } from '../permissions/permissions.constants.js';

/**
 * Custom roles per organization. `isSystem` roles mirror ROLE_PERMISSIONS defaults
 * and cannot be edited; orgs compose custom roles from the canonical permission list.
 */
const roleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, uppercase: true, maxlength: 64 },
    description: { type: String, maxlength: 500 },
    permissions: { type: [String], enum: [...PERMISSIONS], default: [] },
    isSystem: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  },
  { timestamps: true },
);

roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export type RoleDoc = InferSchemaType<typeof roleSchema> & { _id: unknown };
export const Role: Model<RoleDoc> =
  (models.Role as Model<RoleDoc> | undefined) ?? model<RoleDoc>('Role', roleSchema);
