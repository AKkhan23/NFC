import { z } from 'zod';

export const summarySchema = z.object({
  query: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
});

export const exportSchema = z.object({
  query: z.object({
    domain: z.enum(['bands', 'scans', 'attendance', 'access-events', 'transactions', 'audit']),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
});

export const settlementSchema = z.object({
  query: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  }),
});
