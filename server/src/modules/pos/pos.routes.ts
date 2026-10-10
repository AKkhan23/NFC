import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { posService, voidSchema } from './pos.service.js';

export const posRoutes = Router();

posRoutes.use(requireAuth);

/** Counter void — any scanning role; the service constrains what is voidable. */
posRoutes.post('/void', requirePerm('nfc.scan'), validate(voidSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await posService.voidPayment(req.auth!, req.body.transactionId, req.body.reason ?? 'Voided at POS counter');
    res.status(out.replay ? 200 : 201).json({ success: true, data: out, requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});
