import { Router } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { eventController } from './event.controller.js';
import { checkInEventSchema, createEventSchema, listEventsSchema, updateEventSchema } from './event.validators.js';

export const eventRoutes = Router();

eventRoutes.use(requireAuth);
eventRoutes.get('/', requirePerm('access.read'), validate(listEventsSchema), eventController.list);
eventRoutes.post('/', requirePerm('access.manage'), validate(createEventSchema), eventController.create);
eventRoutes.patch('/:id', requirePerm('access.manage'), validate(updateEventSchema), eventController.update);
eventRoutes.post('/:id/check-in', requirePerm('access.manage'), validate(checkInEventSchema), eventController.checkIn);
