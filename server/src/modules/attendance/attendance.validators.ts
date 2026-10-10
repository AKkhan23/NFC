import { z } from 'zod';
import { ATTENDANCE_STATUSES } from './attendance.model.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const listAttendanceSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    date: dateStr.optional(),
    from: dateStr.optional(),
    to: dateStr.optional(),
    userId: objectId.optional(),
    locationId: objectId.optional(),
    status: z.enum(ATTENDANCE_STATUSES).optional(),
  }),
});

export const checkInSchema = z.object({
  body: z.object({
    userId: objectId,
    bandId: objectId.optional(),
    locationId: objectId.optional(),
    at: z.string().datetime().optional(),
  }),
});

export const checkOutSchema = checkInSchema;

export const manualAttendanceSchema = z.object({
  body: z.object({
    userId: objectId,
    date: dateStr,
    checkInAt: z.string().datetime().optional(),
    checkOutAt: z.string().datetime().optional(),
    status: z.enum(ATTENDANCE_STATUSES).optional(),
    remarks: z.string().max(500).optional(),
    locationId: objectId.optional(),
  }),
});

export const correctAttendanceSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      checkInAt: z.string().datetime().nullable().optional(),
      checkOutAt: z.string().datetime().nullable().optional(),
      status: z.enum(ATTENDANCE_STATUSES).optional(),
      remarks: z.string().max(500).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'No fields to correct' }),
});

export type ManualAttendanceInput = z.infer<typeof manualAttendanceSchema>['body'];
