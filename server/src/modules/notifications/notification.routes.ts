import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { notificationController } from './notification.controller.js';
import { listNotificationsSchema } from './notification.validators.js';

export const notificationRoutes = Router();

// Any signed-in user reads their own + org-wide notifications.
notificationRoutes.use(requireAuth);
notificationRoutes.get('/', validate(listNotificationsSchema), notificationController.list);
notificationRoutes.post('/read-all', notificationController.readAll);
notificationRoutes.post('/:id/read', notificationController.read);
