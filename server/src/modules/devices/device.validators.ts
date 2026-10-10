import { z } from 'zod';
import { ADAPTER_TYPES, DEVICE_STATUSES } from './device.model.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const listDevicesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(DEVICE_STATUSES).optional(),
    locationId: objectId.optional(),
  }),
});

export const registerDeviceSchema = z.object({
  body: z.object({
    deviceId: z.string().trim().min(3).max(64).transform((s) => s.toUpperCase()),
    name: z.string().min(2).max(160),
    type: z.enum(['FIXED', 'HANDHELD', 'KIOSK']).default('FIXED'),
    locationId: objectId.optional(),
    gateId: objectId.optional(),
    adapterType: z.enum(ADAPTER_TYPES).default('keyboard'),
    firmware: z.string().max(64).optional(),
    ipAddress: z.string().max(64).optional(),
  }),
});

export const updateDeviceSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: z.string().min(2).max(160).optional(),
      locationId: objectId.nullable().optional(),
      gateId: objectId.nullable().optional(),
      adapterType: z.enum(ADAPTER_TYPES).optional(),
      firmware: z.string().max(64).optional(),
      ipAddress: z.string().max(64).optional(),
      status: z.enum(DEVICE_STATUSES).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' }),
});

export const heartbeatSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    firmware: z.string().max(64).optional(),
    ipAddress: z.string().max(64).optional(),
  }),
});
