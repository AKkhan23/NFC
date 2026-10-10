import { z } from 'zod';

export const listAuditSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    action: z.string().max(80).optional(),
    entityType: z.string().max(40).optional(),
    entityId: z.string().max(64).optional(),
    actorId: z.string().max(64).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
});
