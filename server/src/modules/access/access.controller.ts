import type { NextFunction, Request, Response } from 'express';
import { accessService } from './access.service.js';

function ctx(req: Request) {
  return { ip: req.ip, ua: req.headers['user-agent'], requestId: req.requestId };
}

export const accessController = {
  async listRules(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await accessService.listRules(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        gateId: req.query.gateId as string | undefined,
        locationId: req.query.locationId as string | undefined,
        status: req.query.status as string | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async createRule(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await accessService.createRule(req.auth!, req.body, ctx(req));
      res.status(201).json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async updateRule(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await accessService.updateRule(req.auth!, req.params.id, req.body, ctx(req));
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async listEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await accessService.listEvents(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        gateId: req.query.gateId as string | undefined,
        locationId: req.query.locationId as string | undefined,
        decision: req.query.decision as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
};
