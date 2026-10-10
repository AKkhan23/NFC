import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const code = z.string().trim().min(2).max(32).transform((s) => s.toUpperCase());

export const listLocationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  }),
});

export const createLocationSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(160),
    code,
    type: z.enum(['CAMPUS', 'BUILDING', 'FACILITY', 'VENUE']).default('CAMPUS'),
    address: z.string().max(500).optional(),
    timezone: z.string().max(64).default('UTC'),
  }),
});

export const updateLocationSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: z.string().min(2).max(160).optional(),
      address: z.string().max(500).optional(),
      timezone: z.string().max(64).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' }),
});

export const createZoneSchema = z.object({
  body: z.object({
    locationId: objectId,
    name: z.string().min(2).max(160),
    code,
  }),
});

export const createGateSchema = z.object({
  body: z.object({
    locationId: objectId,
    zoneId: objectId.optional(),
    name: z.string().min(2).max(160),
    code,
    direction: z.enum(['ENTRY', 'EXIT', 'BIDIRECTIONAL']).default('BIDIRECTIONAL'),
  }),
});

export const updateGateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: z.string().min(2).max(160).optional(),
      direction: z.enum(['ENTRY', 'EXIT', 'BIDIRECTIONAL']).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' }),
});
