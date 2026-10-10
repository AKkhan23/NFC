import type { NextFunction, Request, Response } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { AuditLog } from './audit.model.js';
import { listAuditSchema } from './audit.validators.js';
import { Router } from 'express';

export const auditRoutes = Router();

// Append-only log: read-only API, no update/delete routes exist by design.
auditRoutes.use(requireAuth);
auditRoutes.get(
  '/',
  requirePerm('audit.read'),
  validate(listAuditSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = { organizationId: req.auth!.organizationId };
      if (req.query.action) filter.action = req.query.action;
      if (req.query.entityType) filter.entityType = req.query.entityType;
      if (req.query.entityId) filter.entityId = req.query.entityId;
      if (req.query.actorId) filter.actorId = req.query.actorId;
      if (req.query.from ?? req.query.to) {
        filter.createdAt = {
          ...(req.query.from ? { $gte: new Date(req.query.from as string) } : {}),
          ...(req.query.to ? { $lte: new Date(req.query.to as string) } : {}),
        };
      }
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 20);
      const total = await AuditLog.countDocuments(filter);
      const items = await AuditLog.find(filter)
        .populate('actorId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean();
      res.json({ success: true, data: { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) }, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
);
