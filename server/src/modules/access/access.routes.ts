import { Router } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { accessController } from './access.controller.js';
import {
  createRuleSchema,
  listAccessEventsSchema,
  listRulesSchema,
  updateRuleSchema,
} from './access.validators.js';

export const accessRoutes = Router();

accessRoutes.use(requireAuth);
accessRoutes.get('/rules', requirePerm('access.read'), validate(listRulesSchema), accessController.listRules);
accessRoutes.post('/rules', requirePerm('access.manage'), validate(createRuleSchema), accessController.createRule);
accessRoutes.patch('/rules/:id', requirePerm('access.manage'), validate(updateRuleSchema), accessController.updateRule);
accessRoutes.get('/events', requirePerm('access.read'), validate(listAccessEventsSchema), accessController.listEvents);
