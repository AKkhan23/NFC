import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const { model, models } = mongoose;
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

/** Declarative allow/deny evaluated by the access service. DENY with lower `priority` wins. */
const accessRuleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', index: true },
    gateId: { type: Schema.Types.ObjectId, ref: 'Gate', index: true },
    userIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    userGroups: { type: [String], default: [] }, // roles or named groups, e.g. ['STUDENT']
    days: { type: [String], enum: DAYS, default: [...DAYS] },
    startTime: { type: String, default: '00:00' }, // HH:mm
    endTime: { type: String, default: '23:59' }, // HH:mm
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
    bandStatuses: { type: [String], default: ['ACTIVE'] },
    effect: { type: String, enum: ['ALLOW', 'DENY'], required: true, index: true },
    priority: { type: Number, default: 100, index: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  },
  { timestamps: true },
);

accessRuleSchema.index({ organizationId: 1, gateId: 1, status: 1 });
accessRuleSchema.index({ organizationId: 1, locationId: 1, status: 1 });

export type AccessRuleDoc = InferSchemaType<typeof accessRuleSchema> & { _id: unknown };
export const AccessRule: Model<AccessRuleDoc> =
  (models.AccessRule as Model<AccessRuleDoc> | undefined) ?? model<AccessRuleDoc>('AccessRule', accessRuleSchema);

/** Immutable outcome record for every ENTRY/EXIT decision. */
const accessEventSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    bandId: { type: Schema.Types.ObjectId, ref: 'NFCBand', index: true },
    gateId: { type: Schema.Types.ObjectId, ref: 'Gate', index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', index: true },
    direction: { type: String, enum: ['ENTRY', 'EXIT'], required: true, index: true },
    decision: { type: String, enum: ['ALLOW', 'DENY'], required: true, index: true },
    ruleId: { type: Schema.Types.ObjectId, ref: 'AccessRule' },
    reason: { type: String, maxlength: 500 },
    scanId: { type: Schema.Types.ObjectId, ref: 'NFCScan', index: true },
    operatorId: { type: Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

accessEventSchema.index({ organizationId: 1, timestamp: -1 });
accessEventSchema.index({ organizationId: 1, gateId: 1, timestamp: -1 });

export type AccessEventDoc = InferSchemaType<typeof accessEventSchema>;
export const AccessEvent: Model<AccessEventDoc> =
  (models.AccessEvent as Model<AccessEventDoc> | undefined) ?? model<AccessEventDoc>('AccessEvent', accessEventSchema);
