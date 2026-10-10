import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const { model, models } = mongoose;
export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'EARLY_EXIT', 'HALF_DAY', 'ON_LEAVE'] as const;

/**
 * One record per user per calendar day (`date` = YYYY-MM-DD in the location timezone).
 * NFC check-ins update the open record; manual corrections keep `correctionOf` lineage.
 */
const attendanceSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bandId: { type: Schema.Types.ObjectId, ref: 'NFCBand', index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    checkInAt: { type: Date },
    checkOutAt: { type: Date },
    checkInMethod: { type: String, enum: ['NFC', 'MANUAL', 'IMPORT'] },
    checkOutMethod: { type: String, enum: ['NFC', 'MANUAL', 'IMPORT'] },
    status: { type: String, enum: ATTENDANCE_STATUSES, default: 'PRESENT', index: true },
    minutesLate: { type: Number, default: 0 },
    correctionOf: { type: Schema.Types.ObjectId, ref: 'Attendance' },
    correctedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    remarks: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

attendanceSchema.index({ organizationId: 1, userId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ organizationId: 1, date: 1, status: 1 });
attendanceSchema.index({ organizationId: 1, locationId: 1, date: 1 });

export type AttendanceDoc = InferSchemaType<typeof attendanceSchema> & { _id: unknown };
export const Attendance: Model<AttendanceDoc> =
  (models.Attendance as Model<AttendanceDoc> | undefined) ?? model<AttendanceDoc>('Attendance', attendanceSchema);
