import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import { checkinSchema, createPassSchema, passParamsSchema, visitorService } from './visitor.service.js';

export const visitorRoutes = Router();

visitorRoutes.use(requireAuth);

visitorRoutes.post('/', requirePerm('attendance.manage'), validate(createPassSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await visitorService.create(req.auth!, req.body);
    res.status(201).json({ success: true, data, requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

visitorRoutes.get(
  '/',
  requirePerm('attendance.read'),
  validate(z.object({ query: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), status: z.string().max(16).optional(), kind: z.enum(['VISITOR', 'DAY_QR']).optional() }) })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await visitorService.list(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        status: req.query.status as string | undefined,
        kind: req.query.kind as 'VISITOR' | 'DAY_QR' | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
);

visitorRoutes.get('/:id', requirePerm('attendance.read'), validate(passParamsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await visitorService.get(req.auth!, req.params.id), requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

visitorRoutes.post('/:id/revoke', requirePerm('attendance.manage'), validate(passParamsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await visitorService.revoke(req.auth!, req.params.id), requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

/** Gate check-in — any scanning role. */
visitorRoutes.post('/check-in', requirePerm('nfc.scan'), validate(checkinSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await visitorService.checkin(req.auth!, req.body.token);
    res.status(201).json({ success: true, data, requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

export const visitorPublicRoutes = Router();

visitorPublicRoutes.get(
  '/:token',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!/^[0-9a-f]{64}$/.test(req.params.token)) {
        res.status(404).json({ success: false, message: 'Pass not found', code: 'NOT_FOUND', requestId: req.requestId });
        return;
      }
      res.json({ success: true, data: await visitorService.verifyPublic(req.params.token), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
);
