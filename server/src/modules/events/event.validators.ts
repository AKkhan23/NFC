import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const listEventsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED']).optional(),
    upcoming: z.coerce.boolean().optional(),
  }),
});

export const createEventSchema = z.object({
  body: z.object({
    name: z.string().min(3).max(200),
    description: z.string().max(2000).optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    locationId: objectId.optional(),
    capacity: z.number().int().min(0).optional(),
    allowedGroups: z.array(z.string().max(64)).max(50).default([]),
  }).refine((b) => new Date(b.endAt) > new Date(b.startAt), { message: 'endAt must be after startAt' }),
});

export const updateEventSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: z.string().min(3).max(200).optional(),
      description: z.string().max(2000).optional(),
      startAt: z.string().datetime().optional(),
      endAt: z.string().datetime().optional(),
      locationId: objectId.nullable().optional(),
      capacity: z.number().int().min(0).nullable().optional(),
      allowedGroups: z.array(z.string().max(64)).max(50).optional(),
      status: z.enum(['DRAFT', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED']).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' }),
});

export const checkInEventSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ userId: objectId }),
});
