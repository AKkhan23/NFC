import { z } from 'zod';

export const updateSettingsSchema = z.object({
  body: z.object({
    timezone: z.string().max(64).optional(),
    attendanceLateAfter: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm').optional(),
    attendanceDayEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm').optional(),
    dupScanWindowMs: z.number().int().min(0).max(60000).optional(),
    upiPayeeVpa: z.string().max(160).optional(),
    upiPayeeName: z.string().max(160).optional(),
    minTopupMinor: z.number().int().min(1).max(100_000_000).optional(),
    maxTopupMinor: z.number().int().min(1).max(100_000_000).optional(),
    posMenu: z.array(z.object({
      name: z.string().trim().min(1).max(60),
      priceMinor: z.number().int().min(1).max(10_000_000),
    })).max(50).optional(),
  }).refine((b) => Object.keys(b).length > 0, { message: 'No settings to update' }),
});
