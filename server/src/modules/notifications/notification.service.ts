import { emitToOrg } from '../../sockets/index.js';
import { Notification, type NOTIFICATION_TYPES } from './notification.model.js';

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotifyInput {
  organizationId: string;
  /** Null = organization-wide broadcast. */
  userId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  data?: Record<string, unknown>;
}

/** Central fan-out: persist + push to the org room (clients filter by user server-side on read). */
export async function notify(input: NotifyInput) {
  const row = await Notification.create({
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    type: input.type,
    title: input.title,
    body: input.body,
    priority: input.priority ?? 'MEDIUM',
    data: input.data,
  });
  emitToOrg(input.organizationId, 'notification', {
    id: String(row._id),
    userId: input.userId ?? null,
    type: input.type,
    title: input.title,
    priority: row.priority,
  });
  return row.toObject();
}
