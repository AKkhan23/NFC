import { Router } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { userController } from './user.controller.js';
import { createUserSchema, getUserSchema, listUsersSchema, updateUserSchema } from './user.validators.js';

export const userRoutes = Router();

userRoutes.use(requireAuth);
userRoutes.get('/', requirePerm('users.read'), validate(listUsersSchema), userController.list);
userRoutes.post('/', requirePerm('users.create'), validate(createUserSchema), userController.create);
userRoutes.get('/:id', requirePerm('users.read'), validate(getUserSchema), userController.get);
userRoutes.patch('/:id', requirePerm('users.update'), validate(updateUserSchema), userController.update);
