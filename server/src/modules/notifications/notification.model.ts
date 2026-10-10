import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const { model, models } = mongoose;
export const NOTIFICATION_TYPES = [
  'BAND_BLOCKED',
  'BAND_LOST',
  'ACCESS_DENIED',
  'DEVICE_OFFLINE',
  'PAYMENT_FAILED',
  'LOW_BALANCE',
  'SUSPICIOUS_ACTIVITY',
  'SYSTEM_ALERT',
] as const;

const notificationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Null userId = organization-wide broadcast. */
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 2000 },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM', index: true },
    readAt: { type: Date, index: true },
    data: { type: Schema.Types.Mixed },
    expiresAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, readAt: 1 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;
export const Notification: Model<NotificationDoc> =
  (models.Notification as Model<NotificationDoc> | undefined) ??
  model<NotificationDoc>('Notification', notificationSchema);
