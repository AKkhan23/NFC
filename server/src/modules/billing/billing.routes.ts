import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { requireAuth, requirePerm, requireSuperAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { adminSetPlanSchema, billingService, subscribeSchema } from './billing.service.js';
import { apiKeyService, createKeySchema } from './apiKeys.js';

export const billingRoutes = Router();

/** Gateway subscription webhooks are public (HMAC verified) — mount before auth. */
billingRoutes.post('/webhook/razorpay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sig = req.headers['x-razorpay-signature'];
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const out = await billingService.razorpayEvent(raw, typeof sig === 'string' ? sig : undefined);
    res.json({ success: true, data: out, requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

billingRoutes.post('/webhook/stripe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sig = req.headers['stripe-signature'];
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const out = await billingService.stripeEvent(raw, typeof sig === 'string' ? sig : undefined);
    res.json({ success: true, data: out, requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

billingRoutes.use(requireAuth);

billingRoutes.get('/plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: billingService.plans(), requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

billingRoutes.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await billingService.status(req.auth!), requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

billingRoutes.post('/subscribe', requirePerm('settings.manage'), validate(subscribeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await billingService.subscribe(req.auth!, req.body);
    res.status(201).json({ success: true, data: out, requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

billingRoutes.post('/cancel', requirePerm('settings.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await billingService.cancel(req.auth!), requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

/** Org API keys for integrators — creation requires the apiAccess feature. */
billingRoutes.get('/keys', requirePerm('settings.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await apiKeyService.list(req.auth!), requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

billingRoutes.post('/keys', requirePerm('settings.manage'), validate(createKeySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await apiKeyService.create(req.auth!, req.body);
    res.status(201).json({ success: true, data: out, requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

billingRoutes.delete('/keys/:keyId', requirePerm('settings.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await apiKeyService.revoke(req.auth!, req.params.keyId), requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

/** Super-admin org console. */
billingRoutes.get('/orgs', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json({ success: true, data: await billingService.listOrgs(search), requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

billingRoutes.patch(
  '/orgs/:id',
  requireSuperAdmin,
  validate(adminSetPlanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = await billingService.setPlan(req.params.id, req.auth!.userId, req.body);
      res.json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
);
