import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { authController } from './auth.controller.js';
import { loginSchema, refreshSchema } from './auth.validators.js';

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });

export const authRoutes = Router();

authRoutes.post('/login', loginLimiter, validate(loginSchema), authController.login);
authRoutes.post('/refresh', validate(refreshSchema), authController.refresh);
authRoutes.post('/logout', authController.logout);
authRoutes.get('/me', requireAuth, authController.me);
