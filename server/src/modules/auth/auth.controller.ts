import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.login({
        email: req.body.email,
        password: req.body.password,
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      // httpOnly refresh cookie + bearer access token in body
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 3600 * 1000,
        path: '/api/auth',
      });
      res.json({ success: true, data: result, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const token: string = req.body.refreshToken ?? req.cookies?.refreshToken;
      const result = await authService.refresh(token);
      res.json({ success: true, data: result, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const token: string | undefined = req.body.refreshToken ?? req.cookies?.refreshToken;
      if (token) await authService.logout(token);
      res.clearCookie('refreshToken', { path: '/api/auth' });
      res.json({ success: true, data: { ok: true }, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async me(req: Request, res: Response) {
    res.json({ success: true, data: { auth: req.auth }, requestId: req.requestId });
  },
};
