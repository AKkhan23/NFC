import { Router } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { bandController } from './band.controller.js';
import {
  assignBandSchema,
  bandIdParamSchema,
  blockBandSchema,
  getBandSchema,
  listBandsSchema,
  registerBandSchema,
  replaceBandSchema,
} from './band.validators.js';

export const bandRoutes = Router();

bandRoutes.use(requireAuth);
bandRoutes.get('/', requirePerm('bands.read'), validate(listBandsSchema), bandController.list);
bandRoutes.post('/', requirePerm('bands.create'), validate(registerBandSchema), bandController.register);
bandRoutes.get('/:id', requirePerm('bands.read'), validate(getBandSchema), bandController.get);
bandRoutes.post('/:id/assign', requirePerm('bands.assign'), validate(assignBandSchema), bandController.assign);
bandRoutes.post('/:id/activate', requirePerm('bands.assign'), validate(bandIdParamSchema), bandController.activate);
bandRoutes.post('/:id/block', requirePerm('bands.block'), validate(blockBandSchema), bandController.block);
bandRoutes.post('/:id/unblock', requirePerm('bands.block'), validate(bandIdParamSchema), bandController.unblock);
bandRoutes.post('/:id/mark-lost', requirePerm('bands.update'), validate(bandIdParamSchema), bandController.markLost);
bandRoutes.post('/:id/mark-damaged', requirePerm('bands.update'), validate(bandIdParamSchema), bandController.markDamaged);
bandRoutes.post('/:id/replace', requirePerm('bands.replace'), validate(replaceBandSchema), bandController.replace);
bandRoutes.post('/:id/deactivate', requirePerm('bands.update'), validate(bandIdParamSchema), bandController.deactivate);
bandRoutes.post('/:id/tap-link', requirePerm('bands.update'), validate(bandIdParamSchema), bandController.rotateTapLink);
