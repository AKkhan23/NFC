import { z } from 'zod';
import { BAND_STATUSES, BAND_TYPES } from './band.model.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const uid = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^(?:[0-9A-Fa-f]{2}:){3,}[0-9A-Fa-f]{2}$|^[0-9A-Fa-f]{8,24}$/, 'Invalid NFC UID format');

export const listBandsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().max(120).optional(),
    status: z.enum(BAND_STATUSES).optional(),
    type: z.enum(BAND_TYPES).optional(),
    userId: z.string().optional(),
  }),
});

export const getBandSchema = z.object({
  params: z.object({ id: objectId }),
});

export const registerBandSchema = z.object({
  body: z.object({
    bandId: z.string().trim().min(3).max(32).optional(),
    nfcUid: uid,
    type: z.enum(BAND_TYPES),
    expiresAt: z.string().datetime().optional(),
    assignedLocationId: objectId.optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

export const assignBandSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    userId: objectId,
    locationId: objectId.optional(),
  }),
});

export const blockBandSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ reason: z.string().min(3).max(500) }),
});

export const replaceBandSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    nfcUid: uid,
    bandId: z.string().trim().min(3).max(32).optional(),
    reason: z.string().min(3).max(500),
  }),
});

export const bandIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});

export type RegisterBandInput = z.infer<typeof registerBandSchema>['body'];
export type AssignBandInput = z.infer<typeof assignBandSchema>['body'];
export type ReplaceBandInput = z.infer<typeof replaceBandSchema>['body'];
