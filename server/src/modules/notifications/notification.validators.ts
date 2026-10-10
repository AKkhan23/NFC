import { z } from 'zod';
import { NOTIFICATION_TYPES } from './notification.model.js';

export const listNotificationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    unreadOnly: z.coerce.boolean().optional(),
    type: z.enum(NOTIFICATION_TYPES).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  }),
});
