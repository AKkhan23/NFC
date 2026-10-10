import { z } from 'zod';
import { SCAN_ACTIONS } from './nfcScan.model.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const scanSchema = z.object({
  body: z.object({
    nfcUid: z.string().trim().min(1).max(64),
    action: z.enum(SCAN_ACTIONS),
    deviceId: objectId.optional(),
    locationId: objectId.optional(),
    gateId: objectId.optional(),
    /** Required for PAYMENT: amount in minor units (paise/cents). */
    amountMinor: z.number().int().min(1).max(100_000_000).optional(),
    /** Client idempotency key — retries with the same key replay the original scan. */
    requestId: z.string().max(128).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

export const listScansSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    nfcUid: z.string().max(64).optional(),
    action: z.enum(SCAN_ACTIONS).optional(),
    result: z.string().max(16).optional(),
    deviceId: objectId.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
});

export type ScanInput = z.infer<typeof scanSchema>['body'];

export const tapSchema = z.object({
  body: z.object({
    /** Per-band secret from the phone-tap link. This token IS the credential. */
    token: z.string().regex(/^[0-9a-f]{64}$/, 'Invalid tap link'),
  }),
});
