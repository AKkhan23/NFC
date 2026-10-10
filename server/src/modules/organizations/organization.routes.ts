import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { writeAudit } from '../audit/audit.service.js';
import { Organization } from './organization.model.js';
import { updateSettingsSchema } from './organization.validators.js';

export const settingsRoutes = Router();

settingsRoutes.use(requireAuth);

settingsRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await Organization.findById(req.auth!.organizationId)
      .select('name slug status contactEmail settings')
      .lean();
    res.json({ success: true, data: org, requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

settingsRoutes.put(
  '/',
  requirePerm('settings.manage'),
  validate(updateSettingsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = await Organization.findById(req.auth!.organizationId);
      if (!org) {
        res.status(404).json({ success: false, message: 'Organization not found', code: 'NOT_FOUND', requestId: req.requestId });
        return;
      }
      const previousState = { ...(org.settings as object) };
      Object.assign(org.settings as object, req.body);
      await org.save();
      await writeAudit({
        organizationId: String(org._id),
        actorId: req.auth!.userId,
        action: 'SETTINGS_UPDATED',
        entityType: 'Organization',
        entityId: String(org._id),
        previousState,
        newState: req.body,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.requestId,
      });
      res.json({ success: true, data: org.toObject(), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
);
