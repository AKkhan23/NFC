import { Router } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { locationController } from './location.controller.js';
import {
  createGateSchema,
  createLocationSchema,
  createZoneSchema,
  listLocationsSchema,
  updateGateSchema,
  updateLocationSchema,
} from './location.validators.js';

export const locationRoutes = Router();

locationRoutes.use(requireAuth);
locationRoutes.get('/', requirePerm('locations.read'), validate(listLocationsSchema), locationController.list);
locationRoutes.get('/tree', requirePerm('locations.read'), locationController.tree);
locationRoutes.post('/', requirePerm('locations.manage'), validate(createLocationSchema), locationController.create);
locationRoutes.patch('/:id', requirePerm('locations.manage'), validate(updateLocationSchema), locationController.update);
locationRoutes.post('/zones', requirePerm('locations.manage'), validate(createZoneSchema), locationController.createZone);
locationRoutes.post('/gates', requirePerm('locations.manage'), validate(createGateSchema), locationController.createGate);
locationRoutes.patch('/gates/:id', requirePerm('locations.manage'), validate(updateGateSchema), locationController.updateGate);
