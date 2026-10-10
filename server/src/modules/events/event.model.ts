import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const { model, models } = mongoose;
const eventSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', index: true },
    capacity: { type: Number, min: 0 },
    checkedInCount: { type: Number, default: 0, min: 0 },
    allowedGroups: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED'],
      default: 'DRAFT',
      index: true,
    },
    metadata: { type: Schema.Types.Mixed },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

eventSchema.index({ organizationId: 1, startAt: -1 });

export type EventDoc = InferSchemaType<typeof eventSchema> & { _id: unknown };
export const OrgEvent: Model<EventDoc> =
  (models.OrgEvent as Model<EventDoc> | undefined) ?? model<EventDoc>('OrgEvent', eventSchema);
