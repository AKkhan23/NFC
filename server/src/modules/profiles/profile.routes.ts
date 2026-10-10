import { Router } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { profileController } from './profile.controller.js';
import {
  getProfileSchema,
  listProfilesSchema,
  myProfileSchema,
  publicProfileSchema,
  updateProfileSchema,
  upsertProfileSchema,
} from './profile.validators.js';

export const profileRoutes = Router();

// Public tap-profile page + contact file (no login — profiles are public by design).
profileRoutes.get('/p/:slug', validate(publicProfileSchema), profileController.public);
profileRoutes.get('/p/:slug/vcard', validate(publicProfileSchema), profileController.vcard);

profileRoutes.use(requireAuth);
// Self-service for every login (no permission needed) — holders fill their own card.
// Defined before /:id so "me" is never treated as an id.
profileRoutes.get('/me', profileController.mine);
profileRoutes.post('/me', validate(myProfileSchema), profileController.upsertMine);
profileRoutes.get('/', requirePerm('users.read'), validate(listProfilesSchema), profileController.list);
profileRoutes.get('/:id', requirePerm('users.read'), validate(getProfileSchema), profileController.get);
profileRoutes.post('/', requirePerm('users.update'), validate(upsertProfileSchema), profileController.upsert);
profileRoutes.patch('/:id', requirePerm('users.update'), validate(updateProfileSchema), profileController.update);
