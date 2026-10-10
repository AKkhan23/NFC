import { Router } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { deviceController } from './device.controller.js';
import { heartbeatSchema, listDevicesSchema, registerDeviceSchema, updateDeviceSchema } from './device.validators.js';

export const deviceRoutes = Router();

deviceRoutes.use(requireAuth);
deviceRoutes.get('/', requirePerm('devices.read'), validate(listDevicesSchema), deviceController.list);
deviceRoutes.post('/', requirePerm('devices.manage'), validate(registerDeviceSchema), deviceController.register);
deviceRoutes.get('/:id/stats', requirePerm('devices.read'), deviceController.stats);
deviceRoutes.patch('/:id', requirePerm('devices.manage'), validate(updateDeviceSchema), deviceController.update);
// Heartbeat is called by operator terminals: nfc.scan suffices so kiosks stay usable.
deviceRoutes.post('/:id/heartbeat', requirePerm('devices.manage', 'nfc.scan'), validate(heartbeatSchema), deviceController.heartbeat);
