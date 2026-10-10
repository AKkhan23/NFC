import { Router } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { attendanceController } from './attendance.controller.js';
import {
  checkInSchema,
  checkOutSchema,
  correctAttendanceSchema,
  listAttendanceSchema,
  manualAttendanceSchema,
} from './attendance.validators.js';

export const attendanceRoutes = Router();

attendanceRoutes.use(requireAuth);
attendanceRoutes.get('/', requirePerm('attendance.read'), validate(listAttendanceSchema), attendanceController.list);
attendanceRoutes.post('/check-in', requirePerm('attendance.manage'), validate(checkInSchema), attendanceController.checkIn);
attendanceRoutes.post('/check-out', requirePerm('attendance.manage'), validate(checkOutSchema), attendanceController.checkOut);
attendanceRoutes.post('/manual', requirePerm('attendance.manage'), validate(manualAttendanceSchema), attendanceController.manual);
attendanceRoutes.patch('/:id/correct', requirePerm('attendance.manage'), validate(correctAttendanceSchema), attendanceController.correct);
