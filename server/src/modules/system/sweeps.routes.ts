import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { runSweeps } from './sweeps.js';

export const sweepsRoutes = Router();

sweepsRoutes.use(requireAuth);

/** Manual run (the job also runs on boot + every 5 min). */
sweepsRoutes.post('/', requirePerm('settings.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await runSweeps(), requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});
