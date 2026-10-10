import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';


const { model, models } = mongoose;
/** Organization → Location → Zone → Gate → NFC reader hierarchy. */

const locationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, required: true, trim: true, uppercase: true },
    type: {
      type: String,
      enum: ['CAMPUS', 'BUILDING', 'FACILITY', 'VENUE'],
      default: 'CAMPUS',
      index: true,
    },
    address: { type: String, maxlength: 500 },
    timezone: { type: String, default: 'UTC' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
locationSchema.index({ organizationId: 1, code: 1 }, { unique: true });
export type LocationDoc = InferSchemaType<typeof locationSchema> & { _id: unknown };
export const Location: Model<LocationDoc> =
  (models.Location as Model<LocationDoc> | undefined) ?? model<LocationDoc>('Location', locationSchema);

const zoneSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, required: true, trim: true, uppercase: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
zoneSchema.index({ organizationId: 1, locationId: 1, code: 1 }, { unique: true });
export type ZoneDoc = InferSchemaType<typeof zoneSchema> & { _id: unknown };
export const Zone: Model<ZoneDoc> =
  (models.Zone as Model<ZoneDoc> | undefined) ?? model<ZoneDoc>('Zone', zoneSchema);

const gateSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    zoneId: { type: Schema.Types.ObjectId, ref: 'Zone', index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, required: true, trim: true, uppercase: true },
    direction: { type: String, enum: ['ENTRY', 'EXIT', 'BIDIRECTIONAL'], default: 'BIDIRECTIONAL' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
gateSchema.index({ organizationId: 1, locationId: 1, code: 1 }, { unique: true });
export type GateDoc = InferSchemaType<typeof gateSchema> & { _id: unknown };
export const Gate: Model<GateDoc> =
  (models.Gate as Model<GateDoc> | undefined) ?? model<GateDoc>('Gate', gateSchema);
