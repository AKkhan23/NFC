import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');
const day = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

export const listRulesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    gateId: objectId.optional(),
    locationId: objectId.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  }),
});

export const createRuleSchema = z.object({
  body: z.object({
    name: z.string().min(3).max(160),
    locationId: objectId.optional(),
    gateId: objectId.optional(),
    userIds: z.array(objectId).max(500).default([]),
    userGroups: z.array(z.string().max(64)).max(50).default([]),
    days: z.array(day).min(1).default(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
    startTime: hhmm.default('00:00'),
    endTime: hhmm.default('23:59'),
    eventId: objectId.optional(),
    bandStatuses: z.array(z.string().max(24)).default(['ACTIVE']),
    effect: z.enum(['ALLOW', 'DENY']),
    priority: z.number().int().min(0).max(1000).default(100),
  }),
});

export const updateRuleSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: z.string().min(3).max(160).optional(),
      locationId: objectId.nullable().optional(),
      gateId: objectId.nullable().optional(),
      userIds: z.array(objectId).max(500).optional(),
      userGroups: z.array(z.string().max(64)).max(50).optional(),
      days: z.array(day).min(1).optional(),
      startTime: hhmm.optional(),
      endTime: hhmm.optional(),
      eventId: objectId.nullable().optional(),
      bandStatuses: z.array(z.string().max(24)).optional(),
      effect: z.enum(['ALLOW', 'DENY']).optional(),
      priority: z.number().int().min(0).max(1000).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' }),
});

export const listAccessEventsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    gateId: objectId.optional(),
    locationId: objectId.optional(),
    decision: z.enum(['ALLOW', 'DENY']).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>['body'];
